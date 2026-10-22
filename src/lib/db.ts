import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "fs";
import { join, dirname } from "path";

// CaseCommons application store (PRD §9). Node's built-in SQLite: no native build step.
// Identity and roles live in TideCloak; everything here is app data the backend enforces.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  identity_provider_subject TEXT UNIQUE,
  display_name TEXT NOT NULL,
  persona TEXT UNIQUE,
  account_status TEXT NOT NULL DEFAULT 'active',
  is_fictional INTEGER NOT NULL DEFAULT 1,
  -- Roles seen in this user's last verified token. Display/assignment hints only, never used to
  -- authorise: authorisation always reads the live token.
  last_token_roles TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS counsellor_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  organisation TEXT NOT NULL,
  credential_description TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  verification_method TEXT NOT NULL,
  verified_at TEXT,
  service_areas TEXT NOT NULL,
  contact TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  issue_category TEXT NOT NULL,
  organisation_name TEXT NOT NULL,
  event_date TEXT,
  case_status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence_items (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  review_status TEXT NOT NULL DEFAULT 'alleged'
);
CREATE TABLE IF NOT EXISTS case_access_grants (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  granted_by TEXT NOT NULL REFERENCES users(id),
  recipient_user_id TEXT NOT NULL REFERENCES users(id),
  permission_scope TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS consent_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  case_id TEXT NOT NULL REFERENCES cases(id),
  purpose TEXT NOT NULL,
  consent_status TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  granted_at TEXT,
  withdrawn_at TEXT,
  recorded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS review_assignments (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  reviewer_user_id TEXT NOT NULL REFERENCES users(id),
  assigned_by TEXT NOT NULL,
  assignment_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS evidence_reviews (
  id TEXT PRIMARY KEY,
  review_assignment_id TEXT NOT NULL REFERENCES review_assignments(id),
  evidence_item_id TEXT REFERENCES evidence_items(id),
  claim_reference TEXT NOT NULL,
  outcome TEXT NOT NULL,
  rationale TEXT NOT NULL,
  limitations TEXT NOT NULL,
  conflict_declaration TEXT NOT NULL,
  reviewer_user_id TEXT NOT NULL,
  reviewed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS case_notes (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  author_user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS governance_change_requests (
  id TEXT PRIMARY KEY,
  requested_by TEXT NOT NULL REFERENCES users(id),
  change_type TEXT NOT NULL,
  proposed_change TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  approval_status TEXT NOT NULL,
  tidecloak_reference TEXT,
  approvals_recorded INTEGER,
  approvals_required INTEGER,
  last_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  applied_at TEXT,
  application_status TEXT NOT NULL DEFAULT 'not_applied',
  application_error_reference TEXT
);
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT,
  event_type TEXT NOT NULL,
  object_type TEXT,
  object_id TEXT,
  outcome TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'casecommons',
  timestamp TEXT NOT NULL,
  correlation_id TEXT,
  metadata TEXT
);
-- Audit rows are append-only through the application: no endpoint updates or deletes them,
-- and these triggers refuse it at the database level too. Not claimed to be tamper-proof
-- against someone with raw file access (PRD FR-AUD-07).
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events
WHEN (SELECT value FROM app_meta WHERE key = 'allow_reset') IS NOT 'yes'
BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END;
`;

let _db: DatabaseSync | null = null;

export function dbPath(): string {
  return process.env.CASECOMMONS_DB ?? join(process.cwd(), "data", "casecommons.db");
}

export function getDb(): DatabaseSync {
  if (!_db) {
    const path = dbPath();
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    _db = new DatabaseSync(path);
    _db.exec("PRAGMA foreign_keys = ON;");
    _db.exec(SCHEMA);
  }
  return _db;
}

/** Test helper: point the module at a fresh database. */
export function resetDbForTests(path = ":memory:") {
  process.env.CASECOMMONS_DB = path;
  _db?.close();
  _db = null;
  return getDb();
}

export const nowIso = () => new Date().toISOString();
export const newId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
