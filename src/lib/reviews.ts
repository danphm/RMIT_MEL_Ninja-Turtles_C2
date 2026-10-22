import { getDb, newId, nowIso } from "./db";
import { audit } from "./audit";
import type { ReviewState } from "./cases";

// Independent evidence review (PRD §6.8). Reviews are append-only: a new review never edits or
// erases an earlier one, and nothing here touches the original evidence bytes.

export const REVIEW_OUTCOMES: ReviewState[] = ["evidence_reviewed", "corroborated", "unresolved"];

export function assignReview(actorId: string, caseId: string, reviewerUserId: string): { ok: true; id: string } | { ok: false; error: string } {
  const db = getDb();
  const c = db.prepare("SELECT owner_user_id FROM cases WHERE id = ?").get(caseId) as { owner_user_id: string } | undefined;
  if (!c) return { ok: false, error: "Case not found." };
  if (c.owner_user_id === reviewerUserId) return { ok: false, error: "A reviewer cannot review their own case." };
  if (reviewerUserId === actorId) return { ok: false, error: "You cannot assign a review to yourself." };
  // Separation of duties: the counsellor helping with a case does not also review it.
  const helping = db
    .prepare("SELECT 1 FROM case_access_grants WHERE case_id = ? AND recipient_user_id = ? AND status = 'active'")
    .get(caseId, reviewerUserId);
  if (helping) return { ok: false, error: "This person currently has counsellor access to the case." };
  const open = db
    .prepare("SELECT id FROM review_assignments WHERE case_id = ? AND reviewer_user_id = ? AND assignment_status IN ('assigned','in_progress')")
    .get(caseId, reviewerUserId);
  if (open) return { ok: false, error: "That reviewer already has an open assignment for this case." };
  const id = newId("rva");
  db.prepare(
    `INSERT INTO review_assignments (id, case_id, reviewer_user_id, assigned_by, assignment_status, created_at) VALUES (?, ?, ?, ?, 'assigned', ?)`
  ).run(id, caseId, reviewerUserId, actorId, nowIso());
  audit({ actorId, eventType: "review.assigned", objectType: "review_assignment", objectId: id, outcome: "success", correlationId: caseId, metadata: { reviewer: reviewerUserId } });
  return { ok: true, id };
}

export interface ReviewInput {
  evidence_item_id: string | null;
  claim_reference: string;
  outcome: string;
  rationale: string;
  limitations: string;
  conflict_declaration: "none" | "declared";
}

export function recordReview(reviewerId: string, assignmentId: string, caseId: string, input: ReviewInput): { ok: true; id: string } | { ok: false; error: string } {
  const db = getDb();
  if (!REVIEW_OUTCOMES.includes(input.outcome as ReviewState)) return { ok: false, error: "Choose a review outcome." };
  if (!input.claim_reference.trim()) return { ok: false, error: "State which claim was examined." };
  if (!input.rationale.trim()) return { ok: false, error: "A rationale is required." };
  if (!input.limitations.trim()) return { ok: false, error: "State the limitations of this review." };
  if (input.conflict_declaration === "declared") {
    db.prepare("UPDATE review_assignments SET assignment_status = 'recused', completed_at = ? WHERE id = ?").run(nowIso(), assignmentId);
    audit({ actorId: reviewerId, eventType: "review.recused", objectType: "review_assignment", objectId: assignmentId, outcome: "info", correlationId: caseId });
    return { ok: false, error: "Conflict of interest declared: you have been recused and no review was recorded." };
  }
  if (input.evidence_item_id) {
    const e = db.prepare("SELECT case_id FROM evidence_items WHERE id = ?").get(input.evidence_item_id) as { case_id: string } | undefined;
    if (!e || e.case_id !== caseId) return { ok: false, error: "That evidence is not part of this assignment." };
  }
  const id = newId("rev");
  const now = nowIso();
  db.prepare(
    `INSERT INTO evidence_reviews (id, review_assignment_id, evidence_item_id, claim_reference, outcome, rationale, limitations, conflict_declaration, reviewer_user_id, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'none', ?, ?)`
  ).run(id, assignmentId, input.evidence_item_id, input.claim_reference.trim().slice(0, 300), input.outcome, input.rationale.trim().slice(0, 3000), input.limitations.trim().slice(0, 2000), reviewerId, now);
  if (input.evidence_item_id) {
    db.prepare("UPDATE evidence_items SET review_status = ? WHERE id = ?").run(input.outcome, input.evidence_item_id);
  }
  db.prepare("UPDATE review_assignments SET assignment_status = 'in_progress' WHERE id = ? AND assignment_status = 'assigned'").run(assignmentId);
  audit({ actorId: reviewerId, eventType: "review.recorded", objectType: "evidence_review", objectId: id, outcome: "success", correlationId: caseId, metadata: { outcome: input.outcome } });
  return { ok: true, id };
}

export function completeAssignment(reviewerId: string, assignmentId: string, caseId: string) {
  getDb().prepare("UPDATE review_assignments SET assignment_status = 'completed', completed_at = ? WHERE id = ?").run(nowIso(), assignmentId);
  audit({ actorId: reviewerId, eventType: "review.completed", objectType: "review_assignment", objectId: assignmentId, outcome: "success", correlationId: caseId });
}

export function listReviews(caseId: string) {
  return getDb()
    .prepare(
      `SELECT r.id, r.claim_reference, r.outcome, r.rationale, r.limitations, r.reviewed_at, r.evidence_item_id,
              e.original_filename AS evidence_name, u.display_name AS reviewer_name
       FROM evidence_reviews r JOIN review_assignments a ON a.id = r.review_assignment_id
       JOIN users u ON u.id = r.reviewer_user_id LEFT JOIN evidence_items e ON e.id = r.evidence_item_id
       WHERE a.case_id = ? ORDER BY r.reviewed_at DESC`
    )
    .all(caseId);
}

export function listAssignmentsFor(reviewerId: string) {
  return getDb()
    .prepare(
      `SELECT a.id, a.case_id, a.assignment_status, a.created_at, a.completed_at, c.title, c.issue_category, c.organisation_name
       FROM review_assignments a JOIN cases c ON c.id = a.case_id WHERE a.reviewer_user_id = ? ORDER BY a.created_at DESC`
    )
    .all(reviewerId);
}

/** Admin view: assignments without any private case content. */
export function listAllAssignments() {
  return getDb()
    .prepare(
      `SELECT a.id, a.case_id, a.assignment_status, a.created_at, u.display_name AS reviewer_name
       FROM review_assignments a JOIN users u ON u.id = a.reviewer_user_id ORDER BY a.created_at DESC`
    )
    .all();
}

export function getAssignment(id: string) {
  return getDb().prepare("SELECT * FROM review_assignments WHERE id = ?").get(id) as
    | { id: string; case_id: string; reviewer_user_id: string; assignment_status: string }
    | undefined;
}
