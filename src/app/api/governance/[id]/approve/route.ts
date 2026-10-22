import { route } from "@/lib/session";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// AC-GOV-04. This endpoint exists only to refuse. A client claiming "approved: true" (or anything
// else) changes nothing; approvals are signatures in the Tide enclave, verified via TideCloak.
export const POST = route<Ctx>(async (req, p, { params }) => {
  const { id } = await params;
  const body = await req.text().catch(() => "");
  audit({
    actorId: p.user.id,
    eventType: "governance.forged_approval_rejected",
    objectType: "governance_request",
    objectId: id,
    outcome: "denied",
    correlationId: id,
    metadata: { claimed_approval: /"approved"\s*:\s*true/.test(body) },
  });
  return Response.json(
    { error: "CaseCommons does not accept approvals. Approve or deny this change in TideCloak; the app only reads the outcome from TideCloak." },
    { status: 405 }
  );
});
