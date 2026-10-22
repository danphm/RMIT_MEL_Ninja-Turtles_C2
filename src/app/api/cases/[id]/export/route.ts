import { route, denied } from "@/lib/session";
import { authorizeCase } from "@/lib/authz";
import { currentConsent } from "@/lib/cases";
import { listEvidence } from "@/lib/evidence";
import { listGrants } from "@/lib/grants";
import { listReviews } from "@/lib/reviews";
import { listCaseAudit } from "@/lib/audit";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// FR-CASE-07: the owner can export everything held about their case (evidence as metadata;
// each file downloads separately through the authorised evidence route).
export const GET = route<Ctx>(async (_req, p, { params }) => {
  const { id } = await params;
  const { caseRow, decision } = authorizeCase(p, id, "manage_access");
  if (!decision.allowed || !caseRow) return denied();
  audit({ actorId: p.user.id, eventType: "case.exported", objectType: "case", objectId: id, outcome: "success", correlationId: id });
  const payload = {
    exported_at: new Date().toISOString(),
    case: caseRow,
    consent: currentConsent(id),
    evidence: listEvidence(id),
    access_grants: listGrants(id),
    reviews: listReviews(id),
    audit: listCaseAudit(id),
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${id}-export.json"`, "Cache-Control": "no-store" },
  });
});
