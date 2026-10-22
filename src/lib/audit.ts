import { getDb, nowIso } from "./db";

export type AuditSource = "casecommons" | "tidecloak";

export interface AuditInput {
  actorId: string | null;
  eventType: string;
  objectType?: string;
  objectId?: string;
  outcome: "success" | "denied" | "failed" | "pending" | "info";
  source?: AuditSource;
  correlationId?: string;
  /** Identifiers and states only. Never document contents, tokens or free-text descriptions. */
  metadata?: Record<string, string | number | boolean | null>;
}

export function audit(e: AuditInput) {
  getDb()
    .prepare(
      `INSERT INTO audit_events (actor_id, event_type, object_type, object_id, outcome, source, timestamp, correlation_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      e.actorId,
      e.eventType,
      e.objectType ?? null,
      e.objectId ?? null,
      e.outcome,
      e.source ?? "casecommons",
      nowIso(),
      e.correlationId ?? null,
      e.metadata ? JSON.stringify(e.metadata) : null
    );
}

export interface AuditRow {
  id: number;
  actor_id: string | null;
  actor_name: string | null;
  event_type: string;
  object_type: string | null;
  object_id: string | null;
  outcome: string;
  source: string;
  timestamp: string;
  correlation_id: string | null;
  metadata: string | null;
}

const SELECT = `SELECT a.*, u.display_name AS actor_name FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id`;

export function listAudit(limit = 200): AuditRow[] {
  return getDb().prepare(`${SELECT} ORDER BY a.id DESC LIMIT ?`).all(limit) as unknown as AuditRow[];
}

/** Events about one case, its evidence and its grants. */
export function listCaseAudit(caseId: string): AuditRow[] {
  return getDb()
    .prepare(
      `${SELECT} WHERE (a.object_type = 'case' AND a.object_id = ?)
         OR (a.correlation_id = ?)
       ORDER BY a.id DESC LIMIT 200`
    )
    .all(caseId, caseId) as unknown as AuditRow[];
}
