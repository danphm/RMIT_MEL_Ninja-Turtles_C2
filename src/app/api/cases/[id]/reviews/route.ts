import { route, denied, badRequest } from "@/lib/session";
import { authorizeCase } from "@/lib/authz";
import { completeAssignment, recordReview, type ReviewInput } from "@/lib/reviews";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, p, { params }) => {
  const { id } = await params;
  const { decision } = authorizeCase(p, id, "review");
  if (!decision.allowed || decision.basis !== "review_assignment" || !decision.assignmentId) return denied();
  const b = (await req.json().catch(() => ({}))) as Partial<ReviewInput> & { complete?: boolean };
  if (b.complete) {
    completeAssignment(p.user.id, decision.assignmentId, id);
    return Response.json({ ok: true });
  }
  if (b.conflict_declaration !== "none" && b.conflict_declaration !== "declared") return badRequest("Answer the conflict-of-interest question.");
  const r = recordReview(p.user.id, decision.assignmentId, id, {
    evidence_item_id: b.evidence_item_id || null,
    claim_reference: String(b.claim_reference ?? ""),
    outcome: String(b.outcome ?? ""),
    rationale: String(b.rationale ?? ""),
    limitations: String(b.limitations ?? ""),
    conflict_declaration: b.conflict_declaration,
  });
  return r.ok ? Response.json({ id: r.id }, { status: 201 }) : badRequest(r.error);
});
