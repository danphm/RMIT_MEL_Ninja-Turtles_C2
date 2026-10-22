import { getDb, newId, nowIso } from "./db";
import { audit } from "./audit";
import type { CaseRow } from "./authz";

export const ISSUE_CATEGORIES = [
  "Hardship request delayed",
  "Repayment assistance delayed",
  "Missed follow-up",
  "Fees or charges",
  "Collections conduct",
  "Other",
] as const;

export const CONSENT_POLICY_VERSION = "collective-analysis-v1";

export interface CaseInput {
  title: string;
  description: string;
  issue_category: string;
  organisation_name: string;
  event_date?: string | null;
}

export function validateCaseInput(body: unknown): { ok: true; value: CaseInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (k: string, max: number) => (typeof b[k] === "string" ? (b[k] as string).trim().slice(0, max) : "");
  const value: CaseInput = {
    title: str("title", 140),
    description: str("description", 5000),
    issue_category: str("issue_category", 60),
    organisation_name: str("organisation_name", 140),
    event_date: str("event_date", 10) || null,
  };
  if (!value.title) return { ok: false, error: "A title is required." };
  if (!value.description) return { ok: false, error: "Please describe what happened." };
  if (!(ISSUE_CATEGORIES as readonly string[]).includes(value.issue_category))
    return { ok: false, error: "Choose an issue category." };
  if (!value.organisation_name) return { ok: false, error: "Name the organisation involved." };
  if (value.event_date && !/^\d{4}-\d{2}-\d{2}$/.test(value.event_date))
    return { ok: false, error: "Use the date picker for the approximate date." };
  return { ok: true, value };
}

export function createCase(ownerId: string, input: CaseInput, consentToCollective: boolean): CaseRow {
  const db = getDb();
  const id = `case_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const now = nowIso();
  db.prepare(
    `INSERT INTO cases (id, owner_user_id, title, description, issue_category, organisation_name, event_date, case_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
  ).run(id, ownerId, input.title, input.description, input.issue_category, input.organisation_name, input.event_date ?? null, now, now);
  audit({ actorId: ownerId, eventType: "case.created", objectType: "case", objectId: id, outcome: "success", correlationId: id });
  setConsent(ownerId, id, consentToCollective);
  return db.prepare("SELECT * FROM cases WHERE id = ?").get(id) as unknown as CaseRow;
}

export function updateCase(actorId: string, caseId: string, input: CaseInput) {
  // Editing the user's own account of events never touches review records (PRD §6.2).
  getDb()
    .prepare(
      `UPDATE cases SET title = ?, description = ?, issue_category = ?, organisation_name = ?, event_date = ?, updated_at = ? WHERE id = ?`
    )
    .run(input.title, input.description, input.issue_category, input.organisation_name, input.event_date ?? null, nowIso(), caseId);
  audit({ actorId, eventType: "case.updated", objectType: "case", objectId: caseId, outcome: "success", correlationId: caseId });
}

export function listOwnedCases(userId: string) {
  return getDb()
    .prepare(
      `SELECT c.*,
         (SELECT COUNT(*) FROM case_access_grants g WHERE g.case_id = c.id AND g.status = 'active') AS active_grants,
         (SELECT COUNT(*) FROM evidence_items e WHERE e.case_id = c.id) AS evidence_count
       FROM cases c WHERE c.owner_user_id = ? ORDER BY c.created_at DESC`
    )
    .all(userId)
    .map((r) => ({ ...(r as Record<string, unknown>), consent: currentConsent((r as { id: string }).id), review_status: caseReviewStatus((r as { id: string }).id) }));
}

// ---- Consent (FR-CONSENT-*) — separate from access grants, purpose-specific, versioned ----

export function currentConsent(caseId: string) {
  return (
    (getDb()
      .prepare(
        `SELECT consent_status, policy_version, granted_at, withdrawn_at, recorded_at FROM consent_records
         WHERE case_id = ? AND purpose = 'collective_analysis' ORDER BY recorded_at DESC, rowid DESC LIMIT 1`
      )
      .get(caseId) as
      | { consent_status: string; policy_version: string; granted_at: string | null; withdrawn_at: string | null; recorded_at: string }
      | undefined) ?? { consent_status: "not_given", policy_version: CONSENT_POLICY_VERSION, granted_at: null, withdrawn_at: null, recorded_at: null }
  );
}

export function setConsent(userId: string, caseId: string, granted: boolean) {
  const now = nowIso();
  const prev = currentConsent(caseId);
  getDb()
    .prepare(
      `INSERT INTO consent_records (id, user_id, case_id, purpose, consent_status, policy_version, granted_at, withdrawn_at, recorded_at)
       VALUES (?, ?, ?, 'collective_analysis', ?, ?, ?, ?, ?)`
    )
    .run(
      newId("cns"),
      userId,
      caseId,
      granted ? "granted" : prev.consent_status === "granted" ? "withdrawn" : "not_given",
      CONSENT_POLICY_VERSION,
      granted ? now : prev.granted_at,
      granted ? null : prev.consent_status === "granted" ? now : null,
      now
    );
  audit({
    actorId: userId,
    eventType: granted ? "consent.granted" : "consent.withdrawn",
    objectType: "case",
    objectId: caseId,
    outcome: "success",
    correlationId: caseId,
    metadata: { purpose: "collective_analysis", policy_version: CONSENT_POLICY_VERSION },
  });
}

// ---- Review status (FR-REVIEW-04) ----

export type ReviewState = "alleged" | "evidence_reviewed" | "corroborated" | "unresolved";

export const REVIEW_STATE_LABELS: Record<ReviewState, string> = {
  alleged: "Alleged — not yet independently assessed",
  evidence_reviewed: "Evidence reviewed",
  corroborated: "Corroborated within the review's stated scope",
  unresolved: "Unresolved / disputed",
};

/** Latest recorded review outcome for the case; "alleged" until a reviewer records one. */
export function caseReviewStatus(caseId: string): ReviewState {
  const row = getDb()
    .prepare(
      `SELECT r.outcome FROM evidence_reviews r JOIN review_assignments a ON a.id = r.review_assignment_id
       WHERE a.case_id = ? ORDER BY r.reviewed_at DESC, r.rowid DESC LIMIT 1`
    )
    .get(caseId) as { outcome: ReviewState } | undefined;
  return row?.outcome ?? "alleged";
}
