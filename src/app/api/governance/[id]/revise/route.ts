import { route, badRequest } from "@/lib/session";
import { canPropose, tideAdmin } from "@/lib/governanceRoutes";
import { getRequest, reviseRequest } from "@/lib/governance";
import { listSignedInUsers } from "@/lib/users";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, p, { params }) => {
  if (!canPropose(p)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!getRequest(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { target_user_id?: string };
  const target = listSignedInUsers().find((u) => u.id === b.target_user_id);
  if (!target) return badRequest("Choose an account that has signed in to CaseCommons.");
  const r = await reviseRequest(tideAdmin(), id, p.user.id, target.sub);
  return r.ok ? Response.json({ request: r.request }, { status: 201 }) : badRequest(r.error);
});
