import { route, badRequest } from "@/lib/session";
import { createCase, listOwnedCases, validateCaseInput } from "@/lib/cases";

// Only the caller's OWN cases. There is no endpoint that lists other people's cases.
export const GET = route(async (_req, p) => Response.json({ cases: listOwnedCases(p.user.id) }));

export const POST = route(async (req, p) => {
  const body = await req.json().catch(() => null);
  const v = validateCaseInput(body);
  if (!v.ok) return badRequest(v.error);
  // Consent is a separate, explicit choice; creating a case never requires it (FR-CONSENT-02).
  const consent = (body as { consent_collective?: unknown }).consent_collective === true;
  const c = createCase(p.user.id, v.value, consent);
  return Response.json({ case: c }, { status: 201 });
});
