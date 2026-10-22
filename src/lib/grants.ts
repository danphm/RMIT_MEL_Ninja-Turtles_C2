import { getDb, newId, nowIso } from "./db";
import { audit } from "./audit";
import { isVerifiedCounsellor } from "./authz";

// Case-specific access grants (FR-ACCESS-*). Only the case owner reaches these functions; the
// routes check manage_access through authorizeCase() first.

export const GRANT_SCOPES = {
  read: "Case details",
  evidence: "Supporting evidence",
  notes: "Add case notes",
} as const;

export function createGrant(
  ownerId: string,
  caseId: string,
  recipientUserId: string,
  scopes: string[],
  expiresAt: string | null
): { ok: true; id: string } | { ok: false; error: string } {
  if (recipientUserId === ownerId) return { ok: false, error: "You already have access to your own case." };
  if (!isVerifiedCounsellor(recipientUserId))
    return { ok: false, error: "Access can only be shared with a verified counsellor." };
  const clean = Array.from(new Set(["read", ...scopes.filter((s) => s in GRANT_SCOPES)]));
  if (expiresAt && Number.isNaN(Date.parse(expiresAt))) return { ok: false, error: "Invalid expiry date." };
  const db = getDb();
  // One live grant per counsellor per case: replace rather than stack.
  db.prepare(
    `UPDATE case_access_grants SET status = 'superseded', revoked_at = ? WHERE case_id = ? AND recipient_user_id = ? AND status = 'active'`
  ).run(nowIso(), caseId, recipientUserId);
  const id = newId("grt");
  db.prepare(
    `INSERT INTO case_access_grants (id, case_id, granted_by, recipient_user_id, permission_scope, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
  ).run(id, caseId, ownerId, recipientUserId, clean.join(","), nowIso(), expiresAt);
  audit({
    actorId: ownerId,
    eventType: "access.granted",
    objectType: "grant",
    objectId: id,
    outcome: "success",
    correlationId: caseId,
    metadata: { recipient: recipientUserId, scope: clean.join(",") },
  });
  return { ok: true, id };
}

export function revokeGrant(actorId: string, grantId: string) {
  const g = getDb().prepare("SELECT * FROM case_access_grants WHERE id = ?").get(grantId) as
    | { id: string; case_id: string; status: string; recipient_user_id: string }
    | undefined;
  if (!g || g.status !== "active") return false;
  getDb().prepare("UPDATE case_access_grants SET status = 'revoked', revoked_at = ? WHERE id = ?").run(nowIso(), grantId);
  audit({
    actorId,
    eventType: "access.revoked",
    objectType: "grant",
    objectId: grantId,
    outcome: "success",
    correlationId: g.case_id,
    metadata: { recipient: g.recipient_user_id },
  });
  return true;
}

export function getGrant(id: string) {
  return getDb().prepare("SELECT * FROM case_access_grants WHERE id = ?").get(id) as
    | { id: string; case_id: string; status: string; recipient_user_id: string }
    | undefined;
}

export function listGrants(caseId: string) {
  return getDb()
    .prepare(
      `SELECT g.id, g.permission_scope, g.status, g.created_at, g.expires_at, g.revoked_at,
              u.display_name AS recipient_name, p.organisation AS recipient_organisation
       FROM case_access_grants g JOIN users u ON u.id = g.recipient_user_id
       LEFT JOIN counsellor_profiles p ON p.user_id = g.recipient_user_id
       WHERE g.case_id = ? ORDER BY g.created_at DESC`
    )
    .all(caseId);
}

/** Cases currently shared with this counsellor: never a directory of all cases (Screen 5). */
export function casesSharedWith(userId: string) {
  return getDb()
    .prepare(
      `SELECT c.id, c.title, c.issue_category, c.organisation_name, c.case_status, g.permission_scope, g.created_at AS shared_at,
              g.expires_at, u.display_name AS owner_name
       FROM case_access_grants g JOIN cases c ON c.id = g.case_id JOIN users u ON u.id = c.owner_user_id
       WHERE g.recipient_user_id = ? AND g.status = 'active' AND (g.expires_at IS NULL OR g.expires_at > ?)
       ORDER BY g.created_at DESC`
    )
    .all(userId, nowIso());
}

export function listCounsellors() {
  return getDb()
    .prepare(
      `SELECT p.user_id, u.display_name, p.organisation, p.credential_description, p.verification_status,
              p.verification_method, p.verified_at, p.service_areas, p.contact, u.is_fictional
       FROM counsellor_profiles p JOIN users u ON u.id = p.user_id ORDER BY u.display_name`
    )
    .all();
}
