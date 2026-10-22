import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { getDb, newId, nowIso } from "./db";
import { audit } from "./audit";

// Evidence lives outside /public, under a random key, and is only ever streamed back through an
// authorised API route (FR-EVID-03/04/05). File contents are never logged (FR-EVID-08).

export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

const ALLOWED: Record<string, { ext: string[]; magic?: (b: Buffer) => boolean }> = {
  "application/pdf": { ext: [".pdf"], magic: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  "image/png": { ext: [".png"], magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/jpeg": { ext: [".jpg", ".jpeg"], magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "text/plain": { ext: [".txt"], magic: (b) => !b.subarray(0, 4096).includes(0) },
};

export function storageDir() {
  return process.env.CASECOMMONS_STORAGE ?? join(process.cwd(), "storage", "evidence");
}

export function validateUpload(name: string, type: string, bytes: Buffer): { ok: true } | { ok: false; error: string } {
  if (bytes.length === 0) return { ok: false, error: "The file is empty." };
  if (bytes.length > MAX_EVIDENCE_BYTES) return { ok: false, error: "Files must be 5 MB or smaller." };
  const rule = ALLOWED[type];
  const lower = name.toLowerCase();
  if (!rule || !rule.ext.some((e) => lower.endsWith(e)))
    return { ok: false, error: "Upload a PDF, PNG, JPEG or plain-text file." };
  if (rule.magic && !rule.magic(bytes)) return { ok: false, error: "The file contents do not match its type." };
  return { ok: true };
}

export interface EvidenceRow {
  id: string;
  case_id: string;
  uploaded_by: string;
  storage_key: string;
  original_filename: string;
  media_type: string;
  file_size: number;
  uploaded_at: string;
  version: number;
  review_status: string;
}

export function storeEvidence(caseId: string, uploaderId: string, name: string, type: string, bytes: Buffer) {
  const dir = storageDir();
  mkdirSync(dir, { recursive: true });
  const storageKey = randomBytes(24).toString("hex");
  writeFileSync(join(dir, storageKey), bytes);
  const id = newId("evd");
  const safeName = name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  // A same-named upload is a new version, never an overwrite (FR-EVID-07).
  const prev = getDb()
    .prepare("SELECT MAX(version) AS v FROM evidence_items WHERE case_id = ? AND original_filename = ?")
    .get(caseId, safeName) as { v: number | null };
  getDb()
    .prepare(
      `INSERT INTO evidence_items (id, case_id, uploaded_by, storage_key, original_filename, media_type, file_size, uploaded_at, version, review_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'alleged')`
    )
    .run(id, caseId, uploaderId, storageKey, safeName, type, bytes.length, nowIso(), (prev.v ?? 0) + 1);
  audit({
    actorId: uploaderId,
    eventType: "evidence.uploaded",
    objectType: "evidence",
    objectId: id,
    outcome: "success",
    correlationId: caseId,
    metadata: { media_type: type, bytes: bytes.length, version: (prev.v ?? 0) + 1 },
  });
  return id;
}

/** Metadata only; storage_key never leaves the server. */
export function listEvidence(caseId: string) {
  return getDb()
    .prepare(
      `SELECT e.id, e.original_filename, e.media_type, e.file_size, e.uploaded_at, e.version, e.review_status,
              u.display_name AS uploaded_by_name
       FROM evidence_items e JOIN users u ON u.id = e.uploaded_by WHERE e.case_id = ? ORDER BY e.uploaded_at`
    )
    .all(caseId);
}

export function getEvidence(id: string): EvidenceRow | undefined {
  return getDb().prepare("SELECT * FROM evidence_items WHERE id = ?").get(id) as EvidenceRow | undefined;
}

export function readEvidenceBytes(e: EvidenceRow): Buffer {
  return readFileSync(join(storageDir(), e.storage_key));
}
