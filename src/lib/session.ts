import type { NextRequest } from "next/server";
import type { JWTPayload } from "jose";
import { withAuth } from "./auth/protect";
import { userForSubject, type Principal } from "./users";
import { audit } from "./audit";

type Handler<C> = (req: NextRequest, p: Principal, ctx: C) => Promise<Response>;

/** Realm roles as-is; client roles as "client:role" (e.g. "realm-management:tide-realm-admin"). */
export function rolesFromJwt(jwt: JWTPayload): string[] {
  const realm = (jwt.realm_access as { roles?: string[] } | undefined)?.roles ?? [];
  const clients = Object.entries((jwt.resource_access as Record<string, { roles?: string[] }> | undefined) ?? {}).flatMap(
    ([client, v]) => (v.roles ?? []).map((r) => `${client}:${r}`)
  );
  return [...realm, ...clients];
}

export const TIDE_REALM_ADMIN = "realm-management:tide-realm-admin";

/**
 * Every CaseCommons API route goes through here. The template's withAuth verifies the Tide JWT
 * (signature, issuer, azp, expiry) AND the DPoP proof; only then is the subject mapped to an app
 * user. Roles are read from that verified token and nowhere else.
 */
export function route<C = unknown>(handler: Handler<C>, opts: { role?: string } = {}) {
  return (req: NextRequest, ctx: C) =>
    withAuth(async (r, jwt) => {
      if (!jwt.sub) return Response.json({ error: "Token has no subject" }, { status: 401 });
      const roles = rolesFromJwt(jwt);
      const name = (jwt.given_name as string | undefined) || (jwt.name as string | undefined);
      const user = userForSubject(jwt.sub, name, roles);
      const principal: Principal = { user, roles };
      if (opts.role && !roles.includes(opts.role)) {
        audit({ actorId: user.id, eventType: "api.forbidden", objectType: "route", objectId: new URL(r.url).pathname, outcome: "denied", metadata: { required_role: opts.role } });
        return Response.json({ error: "Your account does not have the role this action requires." }, { status: 403 });
      }
      return handler(r, principal, ctx);
    })(req);
}

export const denied = () =>
  // Same answer for "does not exist" and "not yours", so case ids cannot be probed.
  Response.json({ error: "This case is private, or does not exist. Access is restricted." }, { status: 404 });

export const badRequest = (error: string) => Response.json({ error }, { status: 400 });
