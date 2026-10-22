import { route } from "@/lib/session";
import { getDb } from "@/lib/db";

export const GET = route(async (_req, p) => {
  const profile = getDb()
    .prepare("SELECT organisation, verification_status FROM counsellor_profiles WHERE user_id = ?")
    .get(p.user.id);
  return Response.json({
    user: { id: p.user.id, display_name: p.user.display_name, persona: p.user.persona, is_fictional: !!p.user.is_fictional },
    roles: p.roles,
    counsellor_profile: profile ?? null,
    demo_setup_open: process.env.DEMO_SETUP_OPEN === "true",
  });
});
