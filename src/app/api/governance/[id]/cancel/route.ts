import { route, badRequest } from "@/lib/session";
import { canPropose, tideAdmin } from "@/lib/governanceRoutes";
import { cancelRequest, getRequest } from "@/lib/governance";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (_req, p, { params }) => {
  if (!canPropose(p)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!getRequest(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const r = await cancelRequest(tideAdmin(), id, p.user.id);
  return r.ok ? Response.json({ request: r.request }) : badRequest(r.error);
});
