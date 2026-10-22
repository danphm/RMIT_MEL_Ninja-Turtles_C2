import { route, denied } from "@/lib/session";
import { authorizeCase } from "@/lib/authz";
import { getDb, nowIso } from "@/lib/db";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// FR-CASE-07: deletion is a REQUEST. In the MVP it closes sharing immediately and records the
// request; physical erasure follows the documented retention policy (README → Data handling).
export const POST = route<Ctx>(async (_req, p, { params }) => {
  const { id } = await params;
  const { decision } = authorizeCase(p, id, "manage_access");
  if (!decision.allowed) return denied();
  const db = getDb();
  const now = nowIso();
  db.prepare("UPDATE cases SET case_status = 'deletion_requested', updated_at = ? WHERE id = ?").run(now, id);
  db.prepare("UPDATE case_access_grants SET status = 'revoked', revoked_at = ? WHERE case_id = ? AND status = 'active'").run(now, id);
  audit({ actorId: p.user.id, eventType: "case.deletion_requested", objectType: "case", objectId: id, outcome: "pending", correlationId: id });
  return Response.json({ ok: true, note: "Deletion requested. All counsellor access was revoked now." });
});
