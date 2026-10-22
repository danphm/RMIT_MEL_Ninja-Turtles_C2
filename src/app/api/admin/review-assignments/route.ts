import { route, badRequest } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { assignReview, listAllAssignments } from "@/lib/reviews";
import { listReviewerCandidates } from "@/lib/users";
import { getDb } from "@/lib/db";

// Admins route work without reading it: case ids, categories and statuses only — never
// descriptions or evidence (PRD §3.4).
export const GET = route(
  async () =>
    Response.json({
      assignments: listAllAssignments(),
      reviewers: listReviewerCandidates(),
      cases: getDb().prepare("SELECT id, issue_category, case_status, created_at FROM cases ORDER BY id").all(),
    }),
  { role: ROLES.platformAdmin }
);

export const POST = route(
  async (req, p) => {
    const b = (await req.json().catch(() => ({}))) as { case_id?: string; reviewer_user_id?: string };
    if (!b.case_id || !b.reviewer_user_id) return badRequest("Choose a case and a reviewer.");
    const r = assignReview(p.user.id, b.case_id, b.reviewer_user_id);
    return r.ok ? Response.json({ id: r.id }, { status: 201 }) : badRequest(r.error);
  },
  { role: ROLES.platformAdmin }
);
