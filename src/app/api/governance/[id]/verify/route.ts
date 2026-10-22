import { route } from "@/lib/session";
import { canViewGovernance, tideAdmin } from "@/lib/governanceRoutes";
import { getRequest, verifyRequest } from "@/lib/governance";

type Ctx = { params: Promise<{ id: string }> };

// The request body is ignored on purpose: approval state comes only from TideCloak (FR-GOV-06).
export const POST = route<Ctx>(async (_req, p, { params }) => {
  if (!canViewGovernance(p)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!getRequest(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const r = await verifyRequest(tideAdmin(), id, p.user.id);
  return Response.json(r, { status: r.verified ? 200 : 503 });
});
