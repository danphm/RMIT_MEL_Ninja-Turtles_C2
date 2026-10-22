import { beforeEach, describe, expect, it } from "vitest";
import { computeInsights } from "@/lib/insights";
import { caseReviewStatus, setConsent } from "@/lib/cases";
import { assignReview, recordReview } from "@/lib/reviews";
import { createGrant } from "@/lib/grants";
import { decideCase, getCase } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { counsellorA, freshDemo, reviewer } from "./helpers";

beforeEach(freshDemo);

const theme = () => computeInsights().patterns.find((p) => p.issue_category.startsWith("Delayed or missed"));

describe("Collective insights (SC-06, SC-07)", () => {
  it("three consented fictional cases form one potential pattern; the unconsented case is excluded", () => {
    const i = computeInsights();
    expect(i.eligible_cases).toBe(3);
    expect(i.excluded_without_consent).toBe(1);
    const p = theme()!;
    expect(p.total).toBe(3);
    expect(p.by_status).toEqual({ alleged: 1, evidence_reviewed: 1, corroborated: 0, unresolved: 1 });
    expect(p.conclusion).toMatch(/not been established/);
  });

  it("withdrawing consent removes the case on the next computation; group then falls below k and is suppressed", () => {
    setConsent("usr_sam", "case-003", false);
    expect(theme()).toBeUndefined();
    expect(computeInsights().suppressed_groups).toBeGreaterThan(0);
  });

  it("insights expose only counts — no descriptions, titles or ids", () => {
    const json = JSON.stringify(computeInsights());
    expect(json).not.toContain("case-001");
    expect(json).not.toContain("lost shifts");
    expect(json).not.toContain("Alex");
  });

  it("consent and access are independent: consenting shares nothing with a counsellor", () => {
    expect(decideCase(counsellorA(), getCase("case-002"), "read").allowed).toBe(false);
  });
});

describe("Independent review (SC-08, FR-REVIEW-*)", () => {
  it("reviewer records an outcome; dashboard moves from alleged to the reviewed state, never to corroborated by volume", () => {
    const a = assignReview("usr_admin", "case-002", "usr_reviewer");
    expect(a.ok).toBe(true);
    expect(decideCase(reviewer(), getCase("case-002"), "review").allowed).toBe(true);
    const id = a.ok ? a.id : "";
    const missing = recordReview("usr_reviewer", id, "case-002", { evidence_item_id: null, claim_reference: "x", outcome: "corroborated", rationale: "", limitations: "", conflict_declaration: "none" });
    expect(missing.ok).toBe(false);
    const r = recordReview("usr_reviewer", id, "case-002", {
      evidence_item_id: "evd_case-002_1", claim_reference: "Letter sent 30 June", outcome: "evidence_reviewed",
      rationale: "Dated letter present", limitations: "Member's copy only", conflict_declaration: "none",
    });
    expect(r.ok).toBe(true);
    expect(caseReviewStatus("case-002")).toBe("evidence_reviewed");
    expect(theme()!.by_status.alleged).toBe(0);
    expect(theme()!.by_status.corroborated).toBe(0);
  });

  it("reviews are append-only and the original evidence row keeps its file", () => {
    const before = getDb().prepare("SELECT storage_key, file_size FROM evidence_items WHERE id = 'evd_case-001_1'").get();
    const a = assignReview("usr_admin", "case-001", "usr_reviewer");
    recordReview("usr_reviewer", a.ok ? a.id : "", "case-001", { evidence_item_id: "evd_case-001_1", claim_reference: "c", outcome: "unresolved", rationale: "r", limitations: "l", conflict_declaration: "none" });
    const count = getDb().prepare("SELECT COUNT(*) n FROM evidence_reviews r JOIN review_assignments a ON a.id = r.review_assignment_id WHERE a.case_id = 'case-001'").get() as { n: number };
    expect(count.n).toBe(2);
    expect(getDb().prepare("SELECT storage_key, file_size FROM evidence_items WHERE id = 'evd_case-001_1'").get()).toEqual(before);
  });

  it("separation of duties: owner, self-assignment and the case's counsellor cannot be assigned", () => {
    expect(assignReview("usr_admin", "case-001", "usr_alex").ok).toBe(false);
    expect(assignReview("usr_admin", "case-001", "usr_admin").ok).toBe(false);
    createGrant("usr_alex", "case-001", "usr_coun_a", [], null);
    expect(assignReview("usr_admin", "case-001", "usr_coun_a").ok).toBe(false);
  });

  it("declaring a conflict recuses the reviewer and records nothing", () => {
    const a = assignReview("usr_admin", "case-002", "usr_reviewer");
    const r = recordReview("usr_reviewer", a.ok ? a.id : "", "case-002", { evidence_item_id: null, claim_reference: "c", outcome: "corroborated", rationale: "r", limitations: "l", conflict_declaration: "declared" });
    expect(r.ok).toBe(false);
    expect(decideCase(reviewer(), getCase("case-002"), "read").allowed).toBe(false);
  });
});

describe("Audit log", () => {
  it("is append-only at the database level (FR-AUD-05)", () => {
    expect(() => getDb().exec("UPDATE audit_events SET outcome = 'success'")).toThrow(/append-only/);
    expect(() => getDb().exec("DELETE FROM audit_events")).toThrow(/append-only/);
  });
});
