import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { resetDbForTests, getDb } from "@/lib/db";
import { seedDemo } from "@/lib/seed";
import { ROLES } from "@/lib/roles";
import type { Principal, UserRow } from "@/lib/users";

export function freshDemo() {
  process.env.CASECOMMONS_STORAGE = mkdtempSync(join(tmpdir(), "cc-evidence-"));
  resetDbForTests(":memory:");
  seedDemo();
}

/** A principal as the route layer would build it after verifying a Tide token. */
export function as(userId: string, roles: string[] = [ROLES.member]): Principal {
  const user = getDb().prepare("SELECT * FROM users WHERE id = ?").get(userId) as unknown as UserRow;
  return { user, roles };
}

export const alex = () => as("usr_alex");
export const jordan = () => as("usr_jordan");
export const counsellorA = (roles = [ROLES.member, ROLES.counsellor]) => as("usr_coun_a", roles);
export const counsellorD = () => as("usr_coun_d", [ROLES.member, ROLES.counsellor]);
export const reviewer = () => as("usr_reviewer", [ROLES.member, ROLES.reviewer]);
export const admin = (extra: string[] = []) => as("usr_admin", [ROLES.member, ROLES.platformAdmin, ...extra]);

export function auditCount(eventType: string, outcome?: string): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE event_type = ? ${outcome ? "AND outcome = ?" : ""}`)
    .get(...(outcome ? [eventType, outcome] : [eventType])) as { n: number };
  return row.n;
}
