import { route } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { casesSharedWith } from "@/lib/grants";
import { isVerifiedCounsellor } from "@/lib/authz";

export const GET = route(
  async (_req, p) =>
    Response.json({
      verified: isVerifiedCounsellor(p.user.id),
      cases: isVerifiedCounsellor(p.user.id) ? casesSharedWith(p.user.id) : [],
    }),
  { role: ROLES.counsellor }
);
