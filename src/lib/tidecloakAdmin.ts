import { loadTideConfig } from "./auth/tidecloakConfig";

// Server-side client for the TideCloak admin + IGA change-request API (/iga/change-requests).
//
// It FILES and READS governed changes. It cannot approve them: in this realm (Tide multiAdmin) an
// approval is a signature made in the Tide enclave by a linked realm admin, so nothing this server
// holds can satisfy the quorum on its own. The operator credential it uses comes from the server
// environment only (.env, never the client bundle).

export class GovernanceIntegrationError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "GovernanceIntegrationError";
  }
}

export interface ChangeRequest {
  id: string;
  status: "PENDING" | "APPROVED" | "DENIED" | "CANCELLED" | string;
  entityType?: string;
  entityId?: string;
  actionType?: string;
  readyToCommit?: boolean;
  threshold?: number;
  authorizationCount?: number;
  authCount?: number;
  authorizers?: unknown[];
  [k: string]: unknown;
}

export interface FiledChange {
  changeRequestId: string;
  status: string;
  actionType?: string;
}

export interface TideAdmin {
  fileRealmRoleGrant(userId: string, roleName: string): Promise<FiledChange>;
  getChangeRequest(id: string): Promise<ChangeRequest>;
  denyChangeRequest(id: string): Promise<void>;
  getUserRealmRoles(userId: string): Promise<string[]>;
  getRoleHolders(roleName: string): Promise<{ id: string; username: string }[]>;
  consoleUrl(): string;
}

const TIMEOUT_MS = 8000;

export function createTideAdmin(): TideAdmin {
  const cfg = loadTideConfig();
  const base = cfg["auth-server-url"].replace(/\/+$/, "");
  const realm = cfg.realm;
  const adminBase = `${base}/admin/realms/${realm}`;

  async function token(): Promise<string> {
    const user = process.env.KC_BOOTSTRAP_ADMIN_USERNAME;
    const pass = process.env.KC_BOOTSTRAP_ADMIN_PASSWORD;
    if (!user || !pass) throw new GovernanceIntegrationError("TideCloak operator credentials are not configured on the server");
    const res = await call(`${base}/realms/master/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: "admin-cli", grant_type: "password", username: user, password: pass }),
    });
    if (!res.ok) throw new GovernanceIntegrationError(`TideCloak operator sign-in failed (${res.status})`, res.status);
    return ((await res.json()) as { access_token: string }).access_token;
  }

  async function call(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    } catch (e) {
      throw new GovernanceIntegrationError(`TideCloak unreachable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function admin(path: string, init: RequestInit = {}): Promise<Response> {
    const t = await token();
    return call(`${adminBase}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  }

  async function json<T>(path: string): Promise<T> {
    const res = await admin(path);
    if (!res.ok) throw new GovernanceIntegrationError(`TideCloak ${path} answered ${res.status}`, res.status);
    return (await res.json()) as T;
  }

  return {
    async fileRealmRoleGrant(userId, roleName) {
      const role = await json<{ id: string; name: string }>(`/roles/${encodeURIComponent(roleName)}`);
      const res = await admin(`/users/${encodeURIComponent(userId)}/role-mappings/realm`, {
        method: "POST",
        body: JSON.stringify([role]),
      });
      // On an IGA realm a governed write answers 202 with the change request it queued. Anything
      // else means the write was NOT governed (or failed), and we refuse to treat it as a proposal.
      if (res.status !== 202) {
        throw new GovernanceIntegrationError(
          res.ok
            ? `TideCloak applied the role grant immediately (HTTP ${res.status}): IGA governance is not active on this realm`
            : `TideCloak refused the role grant (HTTP ${res.status})`,
          res.status
        );
      }
      const body = (await res.json()) as { changeRequestId?: string; status?: string; actionType?: string };
      if (!body.changeRequestId) throw new GovernanceIntegrationError("TideCloak did not return a change request id");
      return { changeRequestId: body.changeRequestId, status: body.status ?? "PENDING", actionType: body.actionType };
    },
    getChangeRequest: (id) => json<ChangeRequest>(`/iga/change-requests/${encodeURIComponent(id)}`),
    async denyChangeRequest(id) {
      const res = await admin(`/iga/change-requests/${encodeURIComponent(id)}/deny`, { method: "POST" });
      if (!res.ok) throw new GovernanceIntegrationError(`TideCloak deny answered ${res.status}`, res.status);
    },
    async getUserRealmRoles(userId) {
      const roles = await json<{ name: string }[]>(`/users/${encodeURIComponent(userId)}/role-mappings/realm`);
      return roles.map((r) => r.name);
    },
    async getRoleHolders(roleName) {
      return json<{ id: string; username: string }[]>(`/roles/${encodeURIComponent(roleName)}/users`);
    },
    consoleUrl: () => `${base}/admin/${realm}/console/`,
  };
}
