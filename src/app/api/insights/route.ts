import { route } from "@/lib/session";
import { computeInsights } from "@/lib/insights";

export const GET = route(async () => Response.json({ ...computeInsights(), fictional: true }));
