import { getDb } from "./db";
import { caseReviewStatus, currentConsent, type ReviewState } from "./cases";

// Collective insights (PRD §6.7). Recomputed on every request from CURRENT consent, so a withdrawal
// takes effect on the next view; nothing derived is cached or published (FR-CONSENT-07).

/** Groups smaller than this are suppressed entirely: three is not anonymity, but fewer is worse. */
export const MIN_GROUP_SIZE = 3;

export interface Pattern {
  issue_category: string;
  organisation_label: string;
  total: number;
  by_status: Record<ReviewState, number>;
  with_evidence_reviewed: number;
  awaiting_review: number;
  assessment: string;
  conclusion: string;
}

export interface Insights {
  patterns: Pattern[];
  suppressed_groups: number;
  eligible_cases: number;
  excluded_without_consent: number;
  min_group_size: number;
  method: string[];
}

export function computeInsights(): Insights {
  const rows = getDb()
    .prepare("SELECT id, issue_category, organisation_name FROM cases")
    .all() as { id: string; issue_category: string; organisation_name: string }[];

  const eligible = rows.filter((r) => currentConsent(r.id).consent_status === "granted");
  const groups = new Map<string, { cat: string; org: string; ids: string[] }>();
  for (const r of eligible) {
    const key = `${r.issue_category}::${r.organisation_name.trim().toLowerCase()}`;
    const g = groups.get(key) ?? { cat: r.issue_category, org: r.organisation_name.trim(), ids: [] };
    g.ids.push(r.id);
    groups.set(key, g);
  }
  // Related hardship categories form one theme so similar experiences are seen together.
  const theme = (cat: string) =>
    ["Hardship request delayed", "Repayment assistance delayed", "Missed follow-up"].includes(cat)
      ? "Delayed or missed responses to hardship requests"
      : cat;
  const themed = new Map<string, { cat: string; org: string; ids: string[] }>();
  for (const g of groups.values()) {
    const key = `${theme(g.cat)}::${g.org.toLowerCase()}`;
    const t = themed.get(key) ?? { cat: theme(g.cat), org: g.org, ids: [] };
    t.ids.push(...g.ids);
    themed.set(key, t);
  }

  const patterns: Pattern[] = [];
  let suppressed = 0;
  for (const g of themed.values()) {
    if (g.ids.length < MIN_GROUP_SIZE) {
      suppressed++;
      continue;
    }
    const by: Record<ReviewState, number> = { alleged: 0, evidence_reviewed: 0, corroborated: 0, unresolved: 0 };
    for (const id of g.ids) by[caseReviewStatus(id)]++;
    const reviewed = g.ids.length - by.alleged;
    patterns.push({
      issue_category: g.cat,
      organisation_label: g.org,
      total: g.ids.length,
      by_status: by,
      with_evidence_reviewed: reviewed,
      awaiting_review: by.alleged,
      // Complaint volume never upgrades an allegation (FR-AGG-04). There is no publication
      // workflow in the MVP, so the strongest this page can say is "potential pattern".
      assessment: by.alleged > 0 ? "Independent assessment in progress" : "Individual reviews recorded; no systemic assessment published",
      conclusion: "A potential pattern has been identified. Systemic wrongdoing has not been established.",
    });
  }

  return {
    patterns,
    suppressed_groups: suppressed,
    eligible_cases: eligible.length,
    excluded_without_consent: rows.length - eligible.length,
    min_group_size: MIN_GROUP_SIZE,
    method: [
      "Only cases whose owner currently consents to collective analysis are counted. Consent is checked every time this page loads.",
      `Groups with fewer than ${MIN_GROUP_SIZE} cases are hidden. Showing a count of 1 or 2 could identify the person involved.`,
      "Only counts and review states are shown. Descriptions, documents and names never appear here, and there is no drill-down.",
      "Review states come from independent reviewers' recorded outcomes. A higher number of complaints does not change any state.",
      "A small group is not anonymous. Counts this low may still be recognisable to people who know the circumstances.",
    ],
  };
}
