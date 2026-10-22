// Realm roles defined in scripts/realm.json.template. They arrive in the Tide-signed access token;
// the app never accepts a role from the client any other way.
export const ROLES = {
  member: "appUser",
  counsellor: "cc-counsellor",
  reviewer: "cc-reviewer",
  platformAdmin: "cc-platform-admin",
  /** The protected policy. Granting it is an IGA change request that needs the Tide admin quorum. */
  caseAccessOverride: "cc-case-access-override",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<string, string> = {
  [ROLES.member]: "Community member",
  [ROLES.counsellor]: "Financial counsellor",
  [ROLES.reviewer]: "Independent reviewer",
  [ROLES.platformAdmin]: "Platform administrator",
  [ROLES.caseAccessOverride]: "Private-case override (protected)",
};
