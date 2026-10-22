import { route } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { seedDemo } from "@/lib/seed";

// Resets APP data only. Override-role grants in TideCloak are governed and are not touched here.
export const POST = route(
  async () => {
    if (process.env.DEMO_SETUP_OPEN !== "true") return Response.json({ error: "Demo setup is closed." }, { status: 403 });
    seedDemo();
    return Response.json({ ok: true });
  },
  { role: ROLES.platformAdmin }
);
