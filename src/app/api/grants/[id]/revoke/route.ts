import { route, denied } from "@/lib/session";
import { authorizeCase } from "@/lib/authz";
import { getGrant, revokeGrant } from "@/lib/grants";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (_req, p, { params }) => {
  const { id } = await params;
  const g = getGrant(id);
  if (!g) return denied();
  const { decision } = authorizeCase(p, g.case_id, "manage_access");
  if (!decision.allowed) return denied();
  const ok = revokeGrant(p.user.id, id);
  return Response.json({ ok, note: "Revoked. Any copies already downloaded cannot be recalled." });
});
