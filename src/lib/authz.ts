import { getDb, nowIso } from "./db";
import { audit } from "./audit";
import { ROLES } from "./roles";
import type { Principal } from "./users";

// The single place that decides who may do what to a private case (PRD §6.5, §10.1).
// Every case and evidence route calls decideCase(); nothing relies on hiding things in the UI.

export type CaseAction =
  | "read"
  | "read_evidence"
  | "edit"
  | "upload_evidence"
  | "manage_access"
  | "manage_consent"
  | "add_note"
  | "review";

export type AccessBasis = "owner" | "counsellor_grant" | "review_assignment" | "governed_override";

export type Decision =
  | { allowed: true; basis: AccessBasis; grantId?: string; assignmentId?: string }
  | { allowed: false; reason: string };

export interface CaseRow {
  id: string;
  owner_user_id: string;
  title: string;
  description: string;
  issue_category: string;
  organisation_name: string;
  event_date: string | null;
  case_status: string;
  created_at: string;
  updated_at: string;
}

export function getCase(id: string): CaseRow | undefined {
  return getDb().prepare("SELECT * FROM cases WHERE id = ?").get(id) as CaseRow | undefined;
}

const OWNER_ACTIONS: CaseAction[] = [
  "read",
  "read_evidence",
  "edit",
  "upload_evidence",
  "manage_access",
  "manage_consent",
];

export function activeGrantFor(caseId: string, userId: string) {
  return getDb()
    .prepare(
      `SELECT * FROM case_access_grants
       WHERE case_id = ? AND recipient_user_id = ? AND status = 'active'
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(caseId, userId, nowIso()) as { id: string; permission_scope: string } | undefined;
}

export function isVerifiedCounsellor(userId: string): boolean {
  const row = getDb()
    .prepare("SELECT verification_status FROM counsellor_profiles WHERE user_id = ?")
    .get(userId) as { verification_status: string } | undefined;
  return row?.verification_status === "verified";
}

function activeAssignmentFor(caseId: string, userId: string) {
  return getDb()
    .prepare(
      `SELECT id FROM review_assignments
       WHERE case_id = ? AND reviewer_user_id = ? AND assignment_status IN ('assigned', 'in_progress')
       LIMIT 1`
    )
    .get(caseId, userId) as { id: string } | undefined;
}

export function decideCase(p: Principal, caseRow: CaseRow | undefined, action: CaseAction): Decision {
  // Unknown and forbidden look the same to the caller, so ids cannot be probed.
  if (!caseRow) return { allowed: false, reason: "not_found_or_forbidden" };
  const uid = p.user.id;
  const has = (r: string) => p.roles.includes(r);

  if (caseRow.owner_user_id === uid) {
    if (OWNER_ACTIONS.includes(action)) return { allowed: true, basis: "owner" };
    // FR-REVIEW-09: nobody reviews or certifies their own case.
    return { allowed: false, reason: "owner_cannot_" + action };
  }

  // Counsellor: needs the counsellor role in the Tide token, a verified profile, AND a live grant
  // for this specific case. Verification alone never opens a case (FR-COUN-05).
  if (has(ROLES.counsellor) && isVerifiedCounsellor(uid)) {
    const grant = activeGrantFor(caseRow.id, uid);
    if (grant) {
      const scope = grant.permission_scope.split(",");
      const ok =
        action === "read" ||
        (action === "read_evidence" && scope.includes("evidence")) ||
        (action === "add_note" && scope.includes("notes"));
      if (ok) return { allowed: true, basis: "counsellor_grant", grantId: grant.id };
    }
  }

  // Reviewer: only cases explicitly assigned for review (FR-REVIEW-02).
  if (has(ROLES.reviewer)) {
    const a = activeAssignmentFor(caseRow.id, uid);
    if (a && (action === "read" || action === "read_evidence" || action === "review")) {
      return { allowed: true, basis: "review_assignment", assignmentId: a.id };
    }
  }

  // The protected policy. This role only appears in a Tide-signed token after the TideCloak
  // IGA change request that grants it has reached quorum and been committed (PRD §6.9).
  if (has(ROLES.caseAccessOverride) && (action === "read" || action === "read_evidence")) {
    return { allowed: true, basis: "governed_override" };
  }

  return { allowed: false, reason: "no_permission" };
}

/** decideCase + audit trail. Denials and every non-owner read are recorded (FR-AUD-02). */
export function authorizeCase(p: Principal, caseId: string, action: CaseAction) {
  const caseRow = getCase(caseId);
  const decision = decideCase(p, caseRow, action);
  if (!decision.allowed) {
    audit({
      actorId: p.user.id,
      eventType: `case.${action}`,
      objectType: "case",
      objectId: caseId,
      outcome: "denied",
      correlationId: caseId,
      metadata: { reason: decision.reason },
    });
  } else if (decision.basis !== "owner" && (action === "read" || action === "read_evidence")) {
    audit({
      actorId: p.user.id,
      eventType: `case.${action}`,
      objectType: "case",
      objectId: caseId,
      outcome: "success",
      correlationId: caseId,
      metadata: { basis: decision.basis, grant: decision.allowed ? decision.grantId ?? null : null },
    });
  }
  return { caseRow, decision };
}
