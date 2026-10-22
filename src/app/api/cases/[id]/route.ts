import { route, denied, badRequest } from "@/lib/session";
import { authorizeCase, decideCase } from "@/lib/authz";
import { caseReviewStatus, currentConsent, updateCase, validateCaseInput } from "@/lib/cases";
import { listEvidence } from "@/lib/evidence";
import { listGrants } from "@/lib/grants";
import { listReviews } from "@/lib/reviews";
import { getDb } from "@/lib/db";
import { getUser } from "@/lib/users";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, p, { params }) => {
  const { id } = await params;
  const { caseRow, decision } = authorizeCase(p, id, "read");
  if (!decision.allowed || !caseRow) return denied();
  const isOwner = decision.basis === "owner";
  const can = (a: Parameters<typeof decideCase>[2]) => decideCase(p, caseRow, a).allowed;
  return Response.json({
    case: { ...caseRow, owner_name: getUser(caseRow.owner_user_id)?.display_name ?? null },
    access_basis: decision.basis,
    permissions: {
      edit: can("edit"),
      read_evidence: can("read_evidence"),
      upload_evidence: can("upload_evidence"),
      manage_access: can("manage_access"),
      manage_consent: can("manage_consent"),
      add_note: can("add_note"),
      review: can("review"),
    },
    review_status: caseReviewStatus(id),
    evidence: can("read_evidence") ? listEvidence(id) : null,
    reviews: listReviews(id),
    notes: isOwner || can("add_note")
      ? getDb().prepare(
          "SELECT n.id, n.body, n.created_at, u.display_name AS author FROM case_notes n JOIN users u ON u.id = n.author_user_id WHERE n.case_id = ? ORDER BY n.created_at"
        ).all(id)
      : null,
    // Who-has-access and consent are the owner's business only.
    grants: isOwner ? listGrants(id) : null,
    consent: isOwner ? currentConsent(id) : null,
  });
});

export const PATCH = route<Ctx>(async (req, p, { params }) => {
  const { id } = await params;
  const { decision } = authorizeCase(p, id, "edit");
  if (!decision.allowed) return denied();
  const v = validateCaseInput(await req.json().catch(() => null));
  if (!v.ok) return badRequest(v.error);
  updateCase(p.user.id, id, v.value);
  return Response.json({ ok: true });
});
