import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { getDb, nowIso } from "./db";
import { storageDir } from "./evidence";
import { CONSENT_POLICY_VERSION } from "./cases";

// FICTIONAL demonstration data (PRD §12). No real people, organisations or complaints.
// "Northbank Lending" is invented. Personas are bound to real Tide sign-ins via /demo-setup.

const ORG = "Northbank Lending (fictional)";

const USERS = [
  ["usr_alex", "alex", "Alex (fictional)"],
  ["usr_jordan", "jordan", "Jordan (fictional)"],
  ["usr_sam", "sam", "Sam (fictional)"],
  ["usr_coun_a", "counsellor-a", "Counsellor A — Priya N. (demo)"],
  ["usr_coun_b", "counsellor-b", "Counsellor B — Tomás R. (demo)"],
  ["usr_coun_c", "counsellor-c", "Counsellor C — Mei L. (demo)"],
  ["usr_coun_d", "counsellor-d", "Counsellor D — Unverified applicant (demo)"],
  ["usr_reviewer", "reviewer", "Riley — Independent reviewer (demo)"],
  ["usr_admin", "admin", "Morgan — Platform administrator (demo)"],
] as const;

const COUNSELLORS = [
  ["usr_coun_a", "Harbour Community Money Help (demo)", "Diploma of Financial Counselling (demonstration profile)", "verified", "General financial hardship assistance; hardship applications", "Referral via CaseCommons only (demo)"],
  ["usr_coun_b", "Westside Debt Support (demo)", "Diploma of Financial Counselling (demonstration profile)", "verified", "Debt and repayment assistance; payment plans", "Referral via CaseCommons only (demo)"],
  ["usr_coun_c", "Complaints Navigator Service (demo)", "Community legal referral worker (demonstration profile)", "verified", "Organising complaints; referral to external dispute resolution", "Referral via CaseCommons only (demo)"],
  ["usr_coun_d", "Independent (demo)", "Self-declared; not verified", "pending", "General assistance", "Not available until verified"],
] as const;

const CASES = [
  {
    id: "case-001", owner: "usr_alex", title: "Hardship request not answered for 7 weeks",
    category: "Hardship request delayed", date: "2026-07-14", consent: true,
    description: "I applied for hardship assistance on my personal loan after losing shifts at work. I emailed the hardship team and got an automatic reply but no decision. I followed up twice. Meanwhile late fees kept being added. (Fictional demo case.)",
    evidence: [["hardship-request-email.txt", "FICTIONAL DEMO EVIDENCE\nFrom: alex@example.invalid\nTo: hardship@northbank.invalid\nDate: 14 July 2026\nSubject: Request for hardship assistance\n\nI am requesting hardship assistance on loan ending 0000 due to reduced income...\n\n[Auto-reply received 14 July 2026: 'We will respond within 21 days.']\n[No further response as at 1 September 2026.]\n"]],
  },
  {
    id: "case-002", owner: "usr_jordan", title: "Repayment assistance letter ignored",
    category: "Repayment assistance delayed", date: "2026-06-30", consent: true,
    description: "I posted a letter asking to pause repayments for three months and then called to follow up. I was told it was 'with the team'. No outcome a month later. (Fictional demo case.)",
    evidence: [["repayment-letter.txt", "FICTIONAL DEMO EVIDENCE\nLetter dated 30 June 2026 requesting a three-month repayment pause.\nFollow-up call noted 15 July 2026 (reference DEMO-1182).\n"]],
  },
  {
    id: "case-003", owner: "usr_sam", title: "Promised call-back after hardship discussion never came",
    category: "Missed follow-up", date: "2026-08-05", consent: true,
    description: "During a phone call about hardship I was promised a call-back within 5 business days with options. It did not happen. (Fictional demo case.)",
    evidence: [["call-log.txt", "FICTIONAL DEMO EVIDENCE\nPersonal call log:\n05 Aug 2026 10:12 outbound to lender hardship line, 18 min. Told call-back within 5 business days.\n14 Aug 2026 no call received.\n"], ["follow-up-message.txt", "FICTIONAL DEMO EVIDENCE\nSecure message sent 15 Aug 2026: 'Following up on the call-back promised on 5 August.'\n"]],
  },
  {
    id: "case-004", owner: "usr_jordan", title: "Unexpected account fee",
    category: "Fees or charges", date: "2026-08-20", consent: false,
    description: "A fee appeared that I do not recognise. I have NOT opted into collective analysis for this case. (Fictional demo case.)",
    evidence: [],
  },
] as const;

export function seedDemo() {
  const db = getDb();
  const now = nowIso();
  db.exec("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('allow_reset', 'yes')");
  db.exec(`DELETE FROM evidence_reviews; DELETE FROM review_assignments; DELETE FROM case_notes; DELETE FROM consent_records;
           DELETE FROM case_access_grants; DELETE FROM evidence_items; DELETE FROM cases; DELETE FROM governance_change_requests;
           DELETE FROM counsellor_profiles; DELETE FROM audit_events; DELETE FROM users;`);
  db.exec("UPDATE app_meta SET value = 'no' WHERE key = 'allow_reset'");

  rmSync(storageDir(), { recursive: true, force: true });
  mkdirSync(storageDir(), { recursive: true });

  const insUser = db.prepare(
    "INSERT INTO users (id, identity_provider_subject, display_name, persona, is_fictional, created_at, updated_at) VALUES (?, NULL, ?, ?, 1, ?, ?)"
  );
  for (const [id, persona, name] of USERS) insUser.run(id, name, persona, now, now);

  const insProfile = db.prepare(
    `INSERT INTO counsellor_profiles (id, user_id, organisation, credential_description, verification_status, verification_method, verified_at, service_areas, contact)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const [uid, org, cred, status, areas, contact] of COUNSELLORS) {
    insProfile.run(`cp_${uid}`, uid, org, cred, status,
      status === "verified" ? "Demonstration seed data: no real credential check performed" : "Awaiting verification",
      status === "verified" ? "2026-10-01" : null, areas, contact);
  }

  const insCase = db.prepare(
    `INSERT INTO cases (id, owner_user_id, title, description, issue_category, organisation_name, event_date, case_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
  );
  const insEvidence = db.prepare(
    `INSERT INTO evidence_items (id, case_id, uploaded_by, storage_key, original_filename, media_type, file_size, uploaded_at, version, review_status)
     VALUES (?, ?, ?, ?, ?, 'text/plain', ?, ?, 1, 'alleged')`
  );
  const insConsent = db.prepare(
    `INSERT INTO consent_records (id, user_id, case_id, purpose, consent_status, policy_version, granted_at, withdrawn_at, recorded_at)
     VALUES (?, ?, ?, 'collective_analysis', ?, ?, ?, NULL, ?)`
  );
  const insAudit = db.prepare(
    "INSERT INTO audit_events (actor_id, event_type, object_type, object_id, outcome, source, timestamp, correlation_id, metadata) VALUES (?, ?, 'case', ?, 'success', 'casecommons', ?, ?, ?)"
  );
  for (const c of CASES) {
    insCase.run(c.id, c.owner, c.title, c.description, c.category, ORG, c.date, now, now);
    insAudit.run(c.owner, "case.created", c.id, now, c.id, JSON.stringify({ seed: true }));
    insConsent.run(`cns_${c.id}`, c.owner, c.id, c.consent ? "granted" : "not_given", CONSENT_POLICY_VERSION, c.consent ? now : null, now);
    c.evidence.forEach(([name, text], i) => {
      const key = randomBytes(24).toString("hex");
      const bytes = Buffer.from(text, "utf8");
      writeFileSync(join(storageDir(), key), bytes);
      insEvidence.run(`evd_${c.id}_${i + 1}`, c.id, c.owner, key, name, bytes.length, now);
    });
  }

  // Seeded reviews: Case 001 evidence reviewed, Case 003 reviewed but unresolved, Case 002 awaiting.
  const insAssign = db.prepare(
    "INSERT INTO review_assignments (id, case_id, reviewer_user_id, assigned_by, assignment_status, created_at, completed_at) VALUES (?, ?, 'usr_reviewer', 'usr_admin', 'completed', ?, ?)"
  );
  const insReview = db.prepare(
    `INSERT INTO evidence_reviews (id, review_assignment_id, evidence_item_id, claim_reference, outcome, rationale, limitations, conflict_declaration, reviewer_user_id, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'none', 'usr_reviewer', ?)`
  );
  insAssign.run("rva_seed_001", "case-001", now, now);
  insReview.run("rev_seed_001", "rva_seed_001", "evd_case-001_1", "A hardship request was sent on 14 July 2026 and no decision followed for 7 weeks",
    "evidence_reviewed", "The fictional email shows a dated request and an auto-reply promising a response within 21 days. No later response is in the material provided.",
    "Only the member's own copy was examined. The lender's records were not available. This does not establish why no response was sent.", now);
  db.prepare("UPDATE evidence_items SET review_status = 'evidence_reviewed' WHERE id = 'evd_case-001_1'").run();
  insAssign.run("rva_seed_003", "case-003", now, now);
  insReview.run("rev_seed_003", "rva_seed_003", "evd_case-003_1", "A call-back was promised within 5 business days and did not occur",
    "unresolved", "The call log records the call and the promise in the member's own notes. The follow-up message shows the member chased it.",
    "Personal notes cannot confirm what was said on the call. A recording or the lender's notes would be needed to resolve this.", now);
  db.prepare("UPDATE evidence_items SET review_status = 'unresolved' WHERE id = 'evd_case-003_1'").run();

  db.prepare(
    "INSERT INTO audit_events (actor_id, event_type, object_type, object_id, outcome, source, timestamp, metadata) VALUES (NULL, 'demo.seeded', 'system', 'seed', 'info', 'casecommons', ?, ?)"
  ).run(now, JSON.stringify({ fictional: true }));
}
