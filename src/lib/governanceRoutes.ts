import { ROLES } from "./roles";
import { TIDE_REALM_ADMIN } from "./session";
import { createTideAdmin, type TideAdmin } from "./tidecloakAdmin";
import type { Principal } from "./users";

// Platform admins propose; Tide realm admins (the approvers) may watch. Neither can approve here.
export const canViewGovernance = (p: Principal) => p.roles.includes(ROLES.platformAdmin) || p.roles.includes(TIDE_REALM_ADMIN);
export const canPropose = (p: Principal) => p.roles.includes(ROLES.platformAdmin);

let override: TideAdmin | null = null;
/** Tests inject a fake TideCloak; production always talks to the real one. */
export function setTideAdminForTests(t: TideAdmin | null) {
  override = t;
}
export function tideAdmin(): TideAdmin {
  return override ?? createTideAdmin();
}
