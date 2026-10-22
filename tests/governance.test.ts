import { beforeEach, describe, expect, it } from "vitest";
import { fingerprint, getRequest, proposeOverrideGrant, reviseRequest, verifyRequest } from "@/lib/governance";
import { GovernanceIntegrationError, type ChangeRequest, type TideAdmin } from "@/lib/tidecloakAdmin";
import { decideCase, getCase } from "@/lib/authz";
import { ROLES } from "@/lib/roles";
import { getDb } from "@/lib/db";
import { admin, auditCount, freshDemo } from "./helpers";

// A stand-in for TideCloak's IGA API with the behaviour the app relies on: a governed write queues
// a PENDING change request; approvals arrive from outside (the Tide enclave); commit at threshold.
class FakeTide implements TideAdmin {
  crs = new Map<string, ChangeRequest>();
  roles = new Map<string, Set<string>>();
  down = false;
  commitButDontApply = false;
  private n = 0;
  private check() {
    if (this.down) throw new GovernanceIntegrationError("TideCloak unreachable: ECONNREFUSED");
  }
  async fileRealmRoleGrant(userId: string, role: string) {
    this.check();
    const id = `cr-${++this.n}`;
    this.crs.set(id, { id, status: "PENDING", entityType: "USER", entityId: userId, actionType: "GRANT_ROLES", threshold: 2, authorizationCount: 0, roleName: role });
    return { changeRequestId: id, status: "PENDING", actionType: "GRANT_ROLES" };
  }
  /** Simulates one Tide admin signing in the enclave. */
  approve(id: string) {
    const cr = this.crs.get(id)!;
    cr.authorizationCount = (cr.authorizationCount ?? 0) + 1;
    if (cr.authorizationCount >= (cr.threshold ?? 2)) {
      cr.status = "APPROVED";
      if (!this.commitButDontApply) {
        const set = this.roles.get(cr.entityId!) ?? new Set();
        set.add(String(cr.roleName));
        this.roles.set(cr.entityId!, set);
      }
    }
  }
  async getChangeRequest(id: string) {
    this.check();
    return structuredClone(this.crs.get(id)!);
  }
  async denyChangeRequest(id: string) {
    this.check();
    this.crs.get(id)!.status = "DENIED";
  }
  async getUserRealmRoles(userId: string) {
    this.check();
    return [...(this.roles.get(userId) ?? [])];
  }
  async getRoleHolders(role: string) {
    this.check();
    return [...this.roles.entries()].filter(([, r]) => r.has(role)).map(([id]) => ({ id, username: id }));
  }
  consoleUrl() {
    return "http://tide.test/console";
  }
}

const TARGET = "tc-sub-admin";
let tide: FakeTide;
beforeEach(() => {
  freshDemo();
  tide = new FakeTide();
});

async function propose() {
  const r = await proposeOverrideGrant(tide, "usr_admin", TARGET);
  expect(r.approval_status).toBe("pending_approval");
  return r;
}

describe("Protected change: grant private-case override (Journey D/E, §6.9)", () => {
  it("AC-GOV-01: a proposal changes nothing; admin still denied", async () => {
    const r = await propose();
    expect(await tide.getUserRealmRoles(TARGET)).toEqual([]);
    expect((await verifyRequest(tide, r.id, "usr_admin")).request.approval_status).toBe("pending_approval");
    // The admin's token still lacks the role, so the backend still denies.
    expect(decideCase(admin(), getCase("case-001"), "read").allowed).toBe(false);
    expect(auditCount("governance.requested")).toBe(1);
    expect(auditCount("governance.submitted_to_tidecloak")).toBe(1);
  });

  it("AC-GOV-02: one approval of two keeps it pending", async () => {
    const r = await propose();
    tide.approve(r.tidecloak_reference!);
    const v = await verifyRequest(tide, r.id, "usr_admin");
    expect(v.request.approval_status).toBe("pending_approval");
    expect(v.request.approvals_recorded).toBe(1);
    expect(v.request.approvals_required).toBe(2);
  });

  it("AC-GOV-03/07: quorum met in TideCloak → verified → applied only once effective state is confirmed", async () => {
    const r = await propose();
    tide.approve(r.tidecloak_reference!);
    tide.approve(r.tidecloak_reference!);
    const v = await verifyRequest(tide, r.id, "usr_admin");
    expect(v.request.approval_status).toBe("applied");
    expect(v.request.applied_at).toBeTruthy();
    expect(auditCount("governance.quorum_met")).toBe(1);
    expect(auditCount("governance.applied")).toBe(1);
  });

  it("committed but not effective is reported as a failure, never as applied", async () => {
    tide.commitButDontApply = true;
    const r = await propose();
    tide.approve(r.tidecloak_reference!);
    tide.approve(r.tidecloak_reference!);
    const v = await verifyRequest(tide, r.id, "usr_admin");
    expect(v.request.approval_status).toBe("application_failed");
    expect(v.request.application_error_reference).toBe("committed_but_not_effective");
  });

  it("AC-GOV-04: there is no way for client input to approve — verify reads TideCloak only", async () => {
    const r = await propose();
    // Even if someone writes "approved" into our table, the next verify re-derives from TideCloak.
    getDb().prepare("UPDATE governance_change_requests SET approvals_recorded = 99 WHERE id = ?").run(r.id);
    const v = await verifyRequest(tide, r.id, null);
    expect(v.request.approval_status).toBe("pending_approval");
    expect(v.request.approvals_recorded).toBe(0);
  });

  it("AC-GOV-05: revising the proposal withdraws the old CR; old approvals do not carry over", async () => {
    const r = await propose();
    tide.approve(r.tidecloak_reference!);
    const rev = await reviseRequest(tide, r.id, "usr_admin", "tc-sub-someone-else");
    expect(rev.ok).toBe(true);
    if (!rev.ok) return;
    expect(getRequest(r.id)!.approval_status).toBe("cancelled");
    expect(tide.crs.get(r.tidecloak_reference!)!.status).toBe("DENIED");
    expect(rev.request.request_fingerprint).not.toBe(r.request_fingerprint);
    expect(tide.crs.get(rev.request.tidecloak_reference!)!.authorizationCount).toBe(0);
  });

  it("AC-GOV-05: a TideCloak CR for a different target never authorises this request", async () => {
    const r = await propose();
    const cr = tide.crs.get(r.tidecloak_reference!)!;
    cr.entityId = "tc-sub-attacker";
    cr.status = "APPROVED";
    const v = await verifyRequest(tide, r.id, null);
    expect(v.request.approval_status).toBe("application_failed");
    expect(v.request.application_error_reference).toBe("change_request_mismatch");
  });

  it("tampering with the stored proposal is caught by the fingerprint", async () => {
    const r = await propose();
    getDb().prepare("UPDATE governance_change_requests SET proposed_change = ? WHERE id = ?")
      .run(JSON.stringify({ type: "GRANT_REALM_ROLE", role: ROLES.caseAccessOverride, target_user_id: "tc-sub-attacker" }), r.id);
    const v = await verifyRequest(tide, r.id, null);
    expect(v.request.approval_status).toBe("application_failed");
    expect(v.request.application_error_reference).toBe("fingerprint_mismatch");
  });

  it("AC-GOV-06: TideCloak unreachable → submission stays draft, verification fails closed", async () => {
    tide.down = true;
    const d = await proposeOverrideGrant(tide, "usr_admin", TARGET);
    expect(d.approval_status).toBe("draft");
    expect(d.tidecloak_reference).toBeNull();

    tide.down = false;
    const r = await propose();
    tide.approve(r.tidecloak_reference!);
    tide.approve(r.tidecloak_reference!);
    tide.down = true;
    const v = await verifyRequest(tide, r.id, null);
    expect(v.verified).toBe(false);
    expect(v.request.approval_status).toBe("pending_approval");
  });

  it("rejection in TideCloak is reflected and nothing is applied (FR-GOV-13)", async () => {
    const r = await propose();
    await tide.denyChangeRequest(r.tidecloak_reference!);
    const v = await verifyRequest(tide, r.id, null);
    expect(v.request.approval_status).toBe("rejected");
    expect(await tide.getUserRealmRoles(TARGET)).toEqual([]);
  });

  it("fingerprint is canonical (key order independent)", () => {
    const a = fingerprint({ type: "GRANT_REALM_ROLE", role: "r", target_user_id: "u" });
    const b = fingerprint({ target_user_id: "u", role: "r", type: "GRANT_REALM_ROLE" } as never);
    expect(a).toBe(b);
  });
});
