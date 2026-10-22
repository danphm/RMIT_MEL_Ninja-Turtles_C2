import { route } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { listAudit } from "@/lib/audit";

// Read-only. There is deliberately no PUT/PATCH/DELETE for audit events (FR-AUD-05).
export const GET = route(async () => Response.json({ events: listAudit(300) }), { role: ROLES.platformAdmin });
