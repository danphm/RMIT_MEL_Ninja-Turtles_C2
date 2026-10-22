import { route } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { listAssignmentsFor } from "@/lib/reviews";

export const GET = route(async (_req, p) => Response.json({ assignments: listAssignmentsFor(p.user.id) }), {
  role: ROLES.reviewer,
});
