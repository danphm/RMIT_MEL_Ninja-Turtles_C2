import { getDb, newId, nowIso } from "./db";
import { audit } from "./audit";

export interface UserRow {
  id: string;
  identity_provider_subject: string | null;
  display_name: string;
  persona: string | null;
  account_status: string;
  is_fictional: number;
}

/** The authenticated caller: app user row plus roles read from the verified Tide token. */
export interface Principal {
  user: UserRow;
  roles: string[];
}

export function getUser(id: string): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

/**
 * Map a verified token subject to an app user. The subject comes only from a token whose signature
 * and DPoP binding were already checked (FR-AUTH-02); nothing here trusts a client-supplied id.
 */
export function userForSubject(sub: string, displayName: string | undefined, roles: string[] = []): UserRow {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM users WHERE identity_provider_subject = ?")
    .get(sub) as UserRow | undefined;
  if (existing) {
    db.prepare("UPDATE users SET last_token_roles = ? WHERE id = ?").run(roles.join(","), existing.id);
    if (displayName && existing.persona === null && existing.display_name !== displayName) {
      db.prepare("UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?").run(
        displayName,
        nowIso(),
        existing.id
      );
      existing.display_name = displayName;
    }
    return existing;
  }
  const id = newId("usr");
  const now = nowIso();
  db.prepare(
    `INSERT INTO users (id, identity_provider_subject, display_name, persona, is_fictional, last_token_roles, created_at, updated_at)
     VALUES (?, ?, ?, NULL, 0, ?, ?, ?)`
  ).run(id, sub, displayName || "New member", roles.join(","), now, now);
  audit({ actorId: id, eventType: "user.first_sign_in", objectType: "user", objectId: id, outcome: "success" });
  return getUser(id)!;
}

export interface PersonaRow {
  persona: string;
  display_name: string;
  claimed: number;
  is_counsellor: number;
}

/** Signed-in users whose last token carried the reviewer role: candidates for an assignment. */
export function listReviewerCandidates() {
  return getDb()
    .prepare(
      `SELECT id, display_name FROM users
       WHERE identity_provider_subject IS NOT NULL AND (',' || last_token_roles || ',') LIKE '%,cc-reviewer,%'
       ORDER BY display_name`
    )
    .all() as { id: string; display_name: string }[];
}

/** Signed-in accounts, for choosing the target of a governed role change. Ids and names only. */
export function listSignedInUsers() {
  return getDb()
    .prepare(
      `SELECT id, display_name, identity_provider_subject AS sub, last_token_roles FROM users
       WHERE identity_provider_subject IS NOT NULL ORDER BY display_name`
    )
    .all() as { id: string; display_name: string; sub: string; last_token_roles: string | null }[];
}

export function listPersonas(): PersonaRow[] {
  return getDb()
    .prepare(
      `SELECT u.persona, u.display_name, (u.identity_provider_subject IS NOT NULL) AS claimed,
              EXISTS (SELECT 1 FROM counsellor_profiles c WHERE c.user_id = u.id) AS is_counsellor
       FROM users u WHERE u.persona IS NOT NULL AND u.persona NOT IN ('jordan', 'sam') ORDER BY u.persona`
    )
    .all() as unknown as PersonaRow[];
}

/**
 * Demo setup only (DEMO_SETUP_OPEN=true): bind a signed-in Tide account to one fictional seed
 * persona, so the judges' walk-through has Alex's seeded case and a counsellor profile to use.
 * Binding a persona never grants a role: counsellor/reviewer/admin powers still come only from
 * realm roles in the Tide-signed token, which are granted through TideCloak's governed process.
 */
export function claimPersona(principal: Principal, persona: string): { ok: boolean; error?: string } {
  const db = getDb();
  const target = db.prepare("SELECT * FROM users WHERE persona = ?").get(persona) as UserRow | undefined;
  if (!target || persona === "jordan" || persona === "sam") return { ok: false, error: "Unknown persona" };
  if (target.identity_provider_subject) return { ok: false, error: "Persona already claimed" };
  const sub = principal.user.identity_provider_subject;
  const owns = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM cases WHERE owner_user_id = ?) + (SELECT COUNT(*) FROM case_access_grants WHERE recipient_user_id = ? OR granted_by = ?) AS n`
    )
    .get(principal.user.id, principal.user.id, principal.user.id) as { n: number };
  if (owns.n > 0) return { ok: false, error: "This account already has its own cases or grants" };
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE users SET identity_provider_subject = NULL WHERE id = ?").run(principal.user.id);
    db.prepare("UPDATE users SET identity_provider_subject = ?, updated_at = ? WHERE id = ?").run(
      sub,
      nowIso(),
      target.id
    );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  audit({
    actorId: target.id,
    eventType: "demo.persona_claimed",
    objectType: "user",
    objectId: target.id,
    outcome: "success",
    metadata: { persona },
  });
  return { ok: true };
}
