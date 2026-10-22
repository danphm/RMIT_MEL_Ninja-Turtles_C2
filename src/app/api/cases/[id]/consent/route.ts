import { route, denied, badRequest } from "@/lib/session";
import { authorizeCase } from "@/lib/authz";
import { currentConsent, setConsent } from "@/lib/cases";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route<Ctx>(async (req, p, { params }) => {
  const { id } = await params;
  const { decision } = authorizeCase(p, id, "manage_consent");
  if (!decision.allowed) return denied();
  const body = (await req.json().catch(() => ({}))) as { granted?: unknown };
  if (typeof body.granted !== "boolean") return badRequest("Say whether you consent.");
  setConsent(p.user.id, id, body.granted);
  return Response.json({ consent: currentConsent(id) });
});
