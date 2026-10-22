import { route, denied } from "@/lib/session";
import { authorizeCase } from "@/lib/authz";
import { listCaseAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// The owner sees who touched their case, including denied attempts.
export const GET = route<Ctx>(async (_req, p, { params }) => {
  const { id } = await params;
  const { decision } = authorizeCase(p, id, "manage_access");
  if (!decision.allowed) return denied();
  return Response.json({ events: listCaseAudit(id) });
});
