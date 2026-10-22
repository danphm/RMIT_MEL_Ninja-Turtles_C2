import { beforeEach, describe, expect, it } from "vitest";
import { authorizeCase, decideCase, getCase } from "@/lib/authz";
import { createGrant, revokeGrant } from "@/lib/grants";
import { createCase, validateCaseInput } from "@/lib/cases";
import { validateUpload } from "@/lib/evidence";
import { ROLES } from "@/lib/roles";
import { alex, admin, auditCount, counsellorA, counsellorD, freshDemo, jordan, reviewer } from "./helpers";

beforeEach(freshDemo);

describe("Journey B: case-specific counsellor access (SC-02..SC-05)", () => {
  it("owner reads own case; another member cannot (SC-01, FR-AUTH acceptance)", () => {
    expect(decideCase(alex(), getCase("case-001"), "read")).toMatchObject({ allowed: true, basis: "owner" });
    expect(decideCase(jordan(), getCase("case-001"), "read").allowed).toBe(false);
    expect(decideCase(jordan(), getCase("case-001"), "edit").allowed).toBe(false);
  });

  it("verified counsellor has no access until the owner grants it (FR-COUN-05)", () => {
    expect(decideCase(counsellorA(), getCase("case-001"), "read").allowed).toBe(false);
  });

  it("grant → access to that case only; unrelated case denied; revoke → denied again", () => {
    const g = createGrant("usr_alex", "case-001", "usr_coun_a", ["evidence"], null);
    expect(g.ok).toBe(true);

    expect(authorizeCase(counsellorA(), "case-001", "read").decision).toMatchObject({ allowed: true, basis: "counsellor_grant" });
    expect(authorizeCase(counsellorA(), "case-001", "read_evidence").decision.allowed).toBe(true);
    // SC-04: Jordan's case was never shared.
    expect(authorizeCase(counsellorA(), "case-002", "read").decision.allowed).toBe(false);
    expect(auditCount("case.read", "denied")).toBe(1);

    revokeGrant("usr_alex", g.ok ? g.id : "");
    // SC-05: the very next request is denied, including evidence.
    expect(authorizeCase(counsellorA(), "case-001", "read").decision.allowed).toBe(false);
    expect(authorizeCase(counsellorA(), "case-001", "read_evidence").decision.allowed).toBe(false);
  });

  it("grant scope is enforced: no evidence scope → no evidence", () => {
    createGrant("usr_alex", "case-001", "usr_coun_a", [], null);
    expect(decideCase(counsellorA(), getCase("case-001"), "read").allowed).toBe(true);
    expect(decideCase(counsellorA(), getCase("case-001"), "read_evidence").allowed).toBe(false);
    expect(decideCase(counsellorA(), getCase("case-001"), "add_note").allowed).toBe(false);
  });

  it("expired grants stop working", () => {
    createGrant("usr_alex", "case-001", "usr_coun_a", ["evidence"], "2020-01-01T00:00:00.000Z");
    expect(decideCase(counsellorA(), getCase("case-001"), "read").allowed).toBe(false);
  });

  it("a granted counsellor cannot manage access or edit (FR-ACCESS-08)", () => {
    createGrant("usr_alex", "case-001", "usr_coun_a", ["evidence", "notes"], null);
    expect(decideCase(counsellorA(), getCase("case-001"), "manage_access").allowed).toBe(false);
    expect(decideCase(counsellorA(), getCase("case-001"), "edit").allowed).toBe(false);
  });

  it("the grant needs the counsellor ROLE from the token, not just a profile", () => {
    createGrant("usr_alex", "case-001", "usr_coun_a", ["evidence"], null);
    expect(decideCase(counsellorA([ROLES.member]), getCase("case-001"), "read").allowed).toBe(false);
  });

  it("an unverified counsellor cannot be granted access (FR-COUN-03)", () => {
    expect(createGrant("usr_alex", "case-001", "usr_coun_d", [], null).ok).toBe(false);
    expect(decideCase(counsellorD(), getCase("case-001"), "read").allowed).toBe(false);
  });

  it("platform admin cannot read private cases without the governed override (PRD §3.4)", () => {
    expect(authorizeCase(admin(), "case-001", "read").decision.allowed).toBe(false);
    expect(authorizeCase(admin(), "case-001", "read_evidence").decision.allowed).toBe(false);
  });

  it("override role (only present after TideCloak quorum) allows read but never edit", () => {
    const p = admin([ROLES.caseAccessOverride]);
    expect(decideCase(p, getCase("case-001"), "read")).toMatchObject({ allowed: true, basis: "governed_override" });
    expect(decideCase(p, getCase("case-001"), "edit").allowed).toBe(false);
    expect(decideCase(p, getCase("case-001"), "manage_access").allowed).toBe(false);
  });

  it("unknown case ids look identical to forbidden ones", () => {
    expect(decideCase(alex(), getCase("case-999"), "read")).toEqual({ allowed: false, reason: "not_found_or_forbidden" });
  });
});

describe("Reviewers see only assigned cases (FR-REVIEW-02/09)", () => {
  it("seeded reviewer has no open assignment → no access", () => {
    expect(decideCase(reviewer(), getCase("case-002"), "read").allowed).toBe(false);
  });
  it("owner can never review own case", () => {
    expect(decideCase(alex(), getCase("case-001"), "review").allowed).toBe(false);
  });
});

describe("Case and upload validation", () => {
  it("creating a case does not require consent (FR-CONSENT-02)", () => {
    const v = validateCaseInput({ title: "t", description: "d", issue_category: "Other", organisation_name: "o" });
    if (!v.ok) throw new Error(v.error);
    const c = createCase("usr_alex", v.value, false);
    expect(decideCase(alex(), c, "read").allowed).toBe(true);
  });

  it("rejects oversized, mistyped and spoofed uploads", () => {
    expect(validateUpload("a.exe", "application/x-msdownload", Buffer.from("MZ")).ok).toBe(false);
    expect(validateUpload("a.pdf", "application/pdf", Buffer.from("not a pdf")).ok).toBe(false);
    expect(validateUpload("a.pdf", "application/pdf", Buffer.from("%PDF-1.7 ...")).ok).toBe(true);
    expect(validateUpload("big.txt", "text/plain", Buffer.alloc(6 * 1024 * 1024, 65)).ok).toBe(false);
  });
});
