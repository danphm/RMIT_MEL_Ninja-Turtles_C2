import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as listCases } from "@/app/api/cases/route";
import { GET as caseDetail } from "@/app/api/cases/[id]/route";
import { POST as forgeApproval } from "@/app/api/governance/[id]/approve/route";

// Route-level: no valid Tide token + DPoP proof → 401 before any app code runs (FR-AUTH-01/05).
const req = (url: string, headers: Record<string, string> = {}) => new NextRequest(url, { headers });

describe("API rejects unauthenticated and forged credentials", () => {
  it("no Authorization header → 401", async () => {
    expect((await listCases(req("http://localhost:3000/api/cases"), undefined)).status).toBe(401);
  });

  it("a made-up bearer token → 401", async () => {
    const res = await caseDetail(req("http://localhost:3000/api/cases/case-001", { authorization: "Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0." }), { params: Promise.resolve({ id: "case-001" }) });
    expect(res.status).toBe(401);
  });

  it("forged 'approved: true' cannot even reach the handler without a valid token", async () => {
    const r = new NextRequest("http://localhost:3000/api/governance/gov_x/approve", { method: "POST", body: JSON.stringify({ approved: true }) });
    expect((await forgeApproval(r, { params: Promise.resolve({ id: "gov_x" }) })).status).toBe(401);
  });
});
