import { route } from "@/lib/session";
import { listCounsellors } from "@/lib/grants";

// Public-facing profile fields only. Being listed here grants nothing (FR-COUN-05).
export const GET = route(async () => Response.json({ counsellors: listCounsellors() }));
