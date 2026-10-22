import { route, badRequest } from "@/lib/session";
import { claimPersona, listPersonas } from "@/lib/users";

const open = () => process.env.DEMO_SETUP_OPEN === "true";

export const GET = route(async () => Response.json({ open: open(), personas: open() ? listPersonas() : [] }));

export const POST = route(async (req, p) => {
  if (!open()) return Response.json({ error: "Demo setup is closed." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { persona?: string };
  if (!body.persona) return badRequest("Choose a persona.");
  const r = claimPersona(p, body.persona);
  return r.ok ? Response.json({ ok: true }) : badRequest(r.error!);
});
