import { route, denied, badRequest } from "@/lib/session";
import { authorizeCase } from "@/lib/authz";
import { createGrant } from "@/lib/grants";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, p, { params }) => {
  const { id } = await params;
  // manage_access is owner-only: a counsellor can never grant themselves (or anyone) access.
  const { decision } = authorizeCase(p, id, "manage_access");
  if (!decision.allowed) return denied();
  const body = (await req.json().catch(() => ({}))) as { recipient_user_id?: string; scopes?: string[]; expires_at?: string | null };
  if (!body.recipient_user_id) return badRequest("Choose a counsellor.");
  const r = createGrant(p.user.id, id, body.recipient_user_id, Array.isArray(body.scopes) ? body.scopes : [], body.expires_at || null);
  return r.ok ? Response.json({ id: r.id }, { status: 201 }) : badRequest(r.error);
});
