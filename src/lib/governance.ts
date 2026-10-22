import { createHash } from "crypto";
import { getDb, newId, nowIso } from "./db";
import { audit } from "./audit";
import { ROLES } from "./roles";
import { GovernanceIntegrationError, type ChangeRequest, type TideAdmin } from "./tidecloakAdmin";

// Protected governance change (PRD §6.9): "grant the private-case override policy to a user".
//
// The app only PROPOSES the change (a governed TideCloak write, which queues an IGA change request)
// and later VERIFIES what TideCloak reports. Approval happens in TideCloak, signed in the Tide
// enclave by linked realm admins; the quorum is TideCloak's, not ours. Nothing a client sends can
// move a request forward: there is no "approve" endpoint here at all.

export type GovStatus =
  | "draft" // could not be filed with TideCloak (integration failure); nothing is pending anywhere
  | "pending_approval"
  | "approved" // TideCloak committed it; effective state not yet confirmed
  | "applied" // committed AND confirmed effective in TideCloak's role mappings
  | "rejected"
  | "cancelled"
  | "expired"
  | "application_failed";

const TRANSITIONS: Record<GovStatus, GovStatus[]> = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "applied", "rejected", "cancelled", "expired", "application_failed"],
  approved: ["applied", "application_failed"],
  applied: [],
  rejected: [],
  cancelled: [],
  expired: [],
  application_failed: [],
};

export const TERMINAL: GovStatus[] = ["applied", "rejected", "cancelled", "expired", "application_failed"];

export const REQUEST_TTL_HOURS = Number(process.env.GOV_REQUEST_TTL_HOURS ?? 24);

export interface ProposedChange {
  type: "GRANT_REALM_ROLE";
  role: string;
  target_user_id: string; // TideCloak user id == token `sub`
}

export interface GovRow {
  id: string;
  requested_by: string;
  change_type: string;
  proposed_change: string;
  request_fingerprint: string;
  approval_status: GovStatus;
  tidecloak_reference: string | null;
  approvals_recorded: number | null;
  approvals_required: number | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
  application_status: string;
  application_error_reference: string | null;
}

/** sha256 over a canonical (sorted-key) JSON of exactly what will be applied. */
export function fingerprint(change: ProposedChange): string {
  const canonical = JSON.stringify(Object.fromEntries(Object.entries(change).sort(([a], [b]) => a.localeCompare(b))));
  return createHash("sha256").update(canonical).digest("hex");
}

export function getRequest(id: string): GovRow | undefined {
  return getDb().prepare("SELECT * FROM governance_change_requests WHERE id = ?").get(id) as GovRow | undefined;
}

export function listRequests(): GovRow[] {
  return getDb().prepare("SELECT * FROM governance_change_requests ORDER BY created_at DESC").all() as unknown as GovRow[];
}

function transition(row: GovRow, to: GovStatus, fields: Partial<GovRow> = {}) {
  if (!TRANSITIONS[row.approval_status].includes(to)) {
    throw new Error(`Invalid governance transition ${row.approval_status} -> ${to}`);
  }
  const merged = { ...fields, approval_status: to, updated_at: nowIso() };
  const keys = Object.keys(merged);
  getDb()
    .prepare(`UPDATE governance_change_requests SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
    .run(...keys.map((k) => (merged as Record<string, string | number | null>)[k]), row.id);
  Object.assign(row, merged);
}

/** Step 1: file the proposal with TideCloak. Effective permissions are untouched (FR-GOV-03). */
export async function proposeOverrideGrant(tide: TideAdmin, requesterId: string, targetUserId: string): Promise<GovRow> {
  const change: ProposedChange = { type: "GRANT_REALM_ROLE", role: ROLES.caseAccessOverride, target_user_id: targetUserId };
  const id = newId("gov");
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO governance_change_requests (id, requested_by, change_type, proposed_change, request_fingerprint, approval_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`
    )
    .run(id, requesterId, change.type, JSON.stringify(change), fingerprint(change), now, now);
  const row = getRequest(id)!;
  audit({ actorId: requesterId, eventType: "governance.requested", objectType: "governance_request", objectId: id, outcome: "pending", correlationId: id, metadata: { role: change.role, target: targetUserId, fingerprint: row.request_fingerprint.slice(0, 16) } });

  try {
    const filed = await tide.fileRealmRoleGrant(targetUserId, change.role);
    transition(row, "pending_approval", { tidecloak_reference: filed.changeRequestId });
    audit({ actorId: requesterId, eventType: "governance.submitted_to_tidecloak", objectType: "governance_request", objectId: id, outcome: "pending", source: "tidecloak", correlationId: id, metadata: { change_request: filed.changeRequestId, action: filed.actionType ?? null } });
  } catch (e) {
    // Fail closed: stays a draft, nothing was queued or applied (FR-GOV-15).
    const msg = e instanceof GovernanceIntegrationError ? e.message : "unexpected error";
    getDb().prepare("UPDATE governance_change_requests SET application_error_reference = ?, updated_at = ? WHERE id = ?").run(msg, nowIso(), id);
    audit({ actorId: requesterId, eventType: "governance.submission_failed", objectType: "governance_request", objectId: id, outcome: "failed", correlationId: id, metadata: { error: msg } });
  }
  return getRequest(id)!;
}

/**
 * Does the change request TideCloak holds describe exactly the change we stored? Bound by action
 * type, the target user and the role. A request whose target or role differ never authorises ours.
 */
export function changeRequestMatches(cr: ChangeRequest, change: ProposedChange, roleId?: string): boolean {
  if (cr.actionType && cr.actionType !== "GRANT_ROLES") return false;
  const blob = JSON.stringify(cr);
  const targetOk = cr.entityId ? cr.entityId === change.target_user_id : blob.includes(change.target_user_id);
  const roleOk = blob.includes(change.role) || (roleId ? blob.includes(roleId) : false);
  return targetOk && roleOk;
}

export interface VerifyResult {
  request: GovRow;
  verified: boolean;
  error?: string;
}

/**
 * Step 2: ask TideCloak what actually happened. The ONLY way a request advances. Any failure to
 * get an authoritative answer leaves the request where it was (fail closed, FR-GOV-15).
 */
export async function verifyRequest(tide: TideAdmin, id: string, actorId: string | null): Promise<VerifyResult> {
  const row = getRequest(id);
  if (!row) throw new Error("not found");
  if (TERMINAL.includes(row.approval_status) || !row.tidecloak_reference) return { request: row, verified: true };

  const change = JSON.parse(row.proposed_change) as ProposedChange;
  // Integrity: the stored proposal must still hash to the fingerprint captured at submission.
  if (fingerprint(change) !== row.request_fingerprint) {
    transition(row, "application_failed", { application_status: "failed", application_error_reference: "fingerprint_mismatch" });
    audit({ actorId, eventType: "governance.integrity_failed", objectType: "governance_request", objectId: id, outcome: "failed", correlationId: id });
    return { request: row, verified: true, error: "Stored proposal no longer matches its fingerprint" };
  }

  let cr: ChangeRequest;
  try {
    cr = await tide.getChangeRequest(row.tidecloak_reference);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    audit({ actorId, eventType: "governance.verify_failed", objectType: "governance_request", objectId: id, outcome: "failed", correlationId: id, metadata: { error: msg } });
    return { request: row, verified: false, error: msg };
  }

  const recorded = Number(cr.authorizationCount ?? cr.authCount ?? (Array.isArray(cr.authorizers) ? cr.authorizers.length : 0));
  const required = typeof cr.threshold === "number" ? cr.threshold : null;
  getDb()
    .prepare("UPDATE governance_change_requests SET approvals_recorded = ?, approvals_required = ?, last_verified_at = ? WHERE id = ?")
    .run(recorded, required, nowIso(), id);
  Object.assign(row, { approvals_recorded: recorded, approvals_required: required, last_verified_at: nowIso() });

  if (!changeRequestMatches(cr, change)) {
    transition(row, "application_failed", { application_status: "failed", application_error_reference: "change_request_mismatch" });
    audit({ actorId, eventType: "governance.integrity_failed", objectType: "governance_request", objectId: id, outcome: "failed", source: "tidecloak", correlationId: id, metadata: { change_request: cr.id } });
    return { request: row, verified: true, error: "TideCloak's change request does not match this proposal" };
  }

  switch (cr.status) {
    case "PENDING": {
      const ageH = (Date.now() - Date.parse(row.created_at)) / 3_600_000;
      if (ageH > REQUEST_TTL_HOURS) {
        try {
          await tide.denyChangeRequest(cr.id);
        } catch {
          /* still expire locally; TideCloak state is re-read on the next verify */
        }
        transition(row, "expired");
        audit({ actorId, eventType: "governance.expired", objectType: "governance_request", objectId: id, outcome: "info", correlationId: id });
      }
      return { request: row, verified: true };
    }
    case "DENIED":
      transition(row, "rejected");
      audit({ actorId, eventType: "governance.rejected", objectType: "governance_request", objectId: id, outcome: "denied", source: "tidecloak", correlationId: id, metadata: { change_request: cr.id } });
      return { request: row, verified: true };
    case "CANCELLED":
      transition(row, "cancelled");
      audit({ actorId, eventType: "governance.cancelled", objectType: "governance_request", objectId: id, outcome: "info", source: "tidecloak", correlationId: id });
      return { request: row, verified: true };
    case "APPROVED": {
      audit({ actorId, eventType: "governance.quorum_met", objectType: "governance_request", objectId: id, outcome: "success", source: "tidecloak", correlationId: id, metadata: { change_request: cr.id, approvals: recorded, threshold: required } });
      // Committed in TideCloak. Confirm the effective state before claiming it applied (FR-GOV-12).
      try {
        const roles = await tide.getUserRealmRoles(change.target_user_id);
        if (roles.includes(change.role)) {
          transition(row, "applied", { applied_at: nowIso(), application_status: "applied" });
          audit({ actorId, eventType: "governance.applied", objectType: "governance_request", objectId: id, outcome: "success", correlationId: id, metadata: { role: change.role, target: change.target_user_id } });
        } else {
          transition(row, "application_failed", { application_status: "failed", application_error_reference: "committed_but_not_effective" });
          audit({ actorId, eventType: "governance.application_failed", objectType: "governance_request", objectId: id, outcome: "failed", correlationId: id });
        }
      } catch (e) {
        if (row.approval_status === "pending_approval") transition(row, "approved", { application_status: "unconfirmed" });
        return { request: row, verified: false, error: e instanceof Error ? e.message : String(e) };
      }
      return { request: row, verified: true };
    }
    default:
      return { request: row, verified: false, error: `Unknown TideCloak status ${String(cr.status)}` };
  }
}

/**
 * Changing a proposal never inherits approvals (AC-GOV-05): the old request is withdrawn and a new
 * one, with a new fingerprint and a new TideCloak change request, starts from zero.
 */
export async function reviseRequest(tide: TideAdmin, id: string, requesterId: string, newTargetUserId: string) {
  const row = getRequest(id);
  if (!row) throw new Error("not found");
  if (row.approval_status !== "pending_approval" && row.approval_status !== "draft") {
    return { ok: false as const, error: "Only a pending request can be revised." };
  }
  if (row.tidecloak_reference) {
    try {
      await tide.denyChangeRequest(row.tidecloak_reference);
    } catch (e) {
      return { ok: false as const, error: `Could not withdraw the TideCloak change request: ${e instanceof Error ? e.message : e}` };
    }
  }
  transition(row, "cancelled", { application_error_reference: "superseded_by_revision" });
  audit({ actorId: requesterId, eventType: "governance.revised", objectType: "governance_request", objectId: id, outcome: "info", correlationId: id });
  const next = await proposeOverrideGrant(tide, requesterId, newTargetUserId);
  return { ok: true as const, request: next };
}

export async function cancelRequest(tide: TideAdmin, id: string, actorId: string) {
  const row = getRequest(id);
  if (!row) throw new Error("not found");
  if (row.approval_status !== "pending_approval" && row.approval_status !== "draft") return { ok: false as const, error: "Only a pending request can be cancelled." };
  if (row.tidecloak_reference) {
    try {
      await tide.denyChangeRequest(row.tidecloak_reference);
    } catch (e) {
      return { ok: false as const, error: `TideCloak did not confirm the withdrawal: ${e instanceof Error ? e.message : e}` };
    }
  }
  transition(row, "cancelled");
  audit({ actorId, eventType: "governance.cancelled", objectType: "governance_request", objectId: id, outcome: "info", correlationId: id });
  return { ok: true as const, request: row };
}

/** The policy the backend is enforcing right now, read from TideCloak rather than from our table. */
export async function effectivePolicy(tide: TideAdmin) {
  try {
    const holders = await tide.getRoleHolders(ROLES.caseAccessOverride);
    return { verified: true as const, override_holders: holders.map((h) => h.id), checked_at: nowIso() };
  } catch (e) {
    return { verified: false as const, error: e instanceof Error ? e.message : String(e), checked_at: nowIso() };
  }
}
