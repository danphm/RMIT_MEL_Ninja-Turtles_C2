import { route, badRequest } from "@/lib/session";
import { canPropose, canViewGovernance, tideAdmin } from "@/lib/governanceRoutes";
import { effectivePolicy, listRequests, proposeOverrideGrant, REQUEST_TTL_HOURS } from "@/lib/governance";
import { listSignedInUsers } from "@/lib/users";
import { listAudit } from "@/lib/audit";
import { ROLES } from "@/lib/roles";
import { loadTideConfig } from "@/lib/auth/tidecloakConfig";

const forbidden = () => Response.json({ error: "Governance is visible to platform administrators and Tide approvers only." }, { status: 403 });

export const GET = route(async (_req, p) => {
  if (!canViewGovernance(p)) return forbidden();
  const tide = tideAdmin();
  const policy = await effectivePolicy(tide);
  const users = listSignedInUsers();
  const cfg = loadTideConfig();
  const base = cfg["auth-server-url"].replace(/\/+$/, "");
  return Response.json({
    protected_role: ROLES.caseAccessOverride,
    request_ttl_hours: REQUEST_TTL_HOURS,
    requests: listRequests(),
    effective_policy: policy.verified
      ? {
          verified: true,
          checked_at: policy.checked_at,
          override_holders: policy.override_holders.map((sub) => ({
            sub,
            display_name: users.find((u) => u.sub === sub)?.display_name ?? "TideCloak user (not signed in to CaseCommons)",
          })),
        }
      : { verified: false, error: policy.error, checked_at: policy.checked_at },
    users: users.map((u) => ({ id: u.id, sub: u.sub, display_name: u.display_name })),
    you_can_propose: canPropose(p),
    tidecloak: {
      approval_console: `${base}/admin/${cfg.realm}/console/`,
      tide_console: `${base}/realms/${cfg.realm}/tide-console/`,
      realm: cfg.realm,
    },
    events: listAudit(300).filter((e) => e.event_type.startsWith("governance.")).slice(0, 60),
  });
});

export const POST = route(async (req, p) => {
  if (!canPropose(p)) return forbidden();
  const b = (await req.json().catch(() => ({}))) as { target_user_id?: string };
  const target = listSignedInUsers().find((u) => u.id === b.target_user_id);
  if (!target) return badRequest("Choose an account that has signed in to CaseCommons.");
  const request = await proposeOverrideGrant(tideAdmin(), p.user.id, target.sub);
  return Response.json({ request }, { status: request.approval_status === "draft" ? 502 : 201 });
});
