"use client";

import { RequireAuth, ErrorNote } from "@/components/Shell";
import { useLoad } from "@/lib/client/useApi";

interface Pattern {
  issue_category: string;
  organisation_label: string;
  total: number;
  by_status: { alleged: number; evidence_reviewed: number; corroborated: number; unresolved: number };
  with_evidence_reviewed: number;
  awaiting_review: number;
  assessment: string;
  conclusion: string;
}
interface Insights { patterns: Pattern[]; suppressed_groups: number; eligible_cases: number; excluded_without_consent: number; min_group_size: number; method: string[] }

const SEGMENTS: { key: keyof Pattern["by_status"]; label: string; color: string }[] = [
  { key: "alleged", label: "Allegation only (awaiting review)", color: "var(--line-strong)" },
  { key: "evidence_reviewed", label: "Evidence reviewed", color: "var(--info)" },
  { key: "unresolved", label: "Unresolved / disputed", color: "var(--warn)" },
  { key: "corroborated", label: "Corroborated (stated scope)", color: "var(--signal-fill)" },
];

function StatusBar({ p }: { p: Pattern }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 2, height: 14, borderRadius: "var(--radius-control)", overflow: "hidden", background: "var(--surface-2)" }} role="img"
        aria-label={SEGMENTS.map((s) => `${p.by_status[s.key]} ${s.label}`).join(", ")}>
        {SEGMENTS.map((s) => p.by_status[s.key] > 0 && <span key={s.key} style={{ flex: p.by_status[s.key], background: s.color }} />)}
      </div>
      <ul className="row small" style={{ listStyle: "none", padding: 0, margin: ".5rem 0 0" }}>
        {SEGMENTS.map((s) => (
          <li key={s.key} className="row" style={{ gap: ".3rem" }}><span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: "inline-block" }} />{s.label}: <strong>{p.by_status[s.key]}</strong></li>
        ))}
      </ul>
    </div>
  );
}

function InsightsPage() {
  const { data, error } = useLoad<Insights>("/api/insights");
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Collective insights</h1>
          <p>Potential patterns across complaints whose owners have opted in. This page shows counts and review states only. It never shows stories, documents or names.</p>
        </div>
      </div>
      <div className="notice warn"><strong>Illustrative demo data.</strong> These figures come from fictional records. They are not real-world findings, and they don&apos;t show that any organisation did anything wrong.</div>
      <ErrorNote error={error} />
      {data && (
        <>
          <div className="grid grid-3" style={{ marginBottom: "1rem" }}>
            <div className="card"><div className="stat">{data.eligible_cases}</div><div className="stat-label">cases currently consented to collective analysis</div></div>
            <div className="card"><div className="stat">{data.excluded_without_consent}</div><div className="stat-label">cases excluded (no current consent)</div></div>
            <div className="card"><div className="stat">{data.suppressed_groups}</div><div className="stat-label">groups hidden (fewer than {data.min_group_size} cases)</div></div>
          </div>
          {data.patterns.length === 0 && <div className="card"><p>No group currently reaches the minimum size to display.</p></div>}
          {data.patterns.map((p) => (
            <section key={p.issue_category + p.organisation_label} className="card">
              <p className="muted small" style={{ margin: 0 }}>Potential pattern</p>
              <h2>{p.issue_category}</h2>
              <p className="small muted">Organisation named in the complaints: {p.organisation_label}</p>
              <div className="grid grid-3" style={{ margin: "1rem 0" }}>
                <div><div className="stat">{p.total}</div><div className="stat-label">similar complaints submitted</div></div>
                <div><div className="stat">{p.with_evidence_reviewed}</div><div className="stat-label">with supporting evidence independently reviewed</div></div>
                <div><div className="stat">{p.awaiting_review}</div><div className="stat-label">awaiting review</div></div>
              </div>
              <StatusBar p={p} />
              <hr />
              <dl className="kv">
                <dt>Independent assessment</dt><dd>{p.assessment}</dd>
                <dt>Conclusion</dt><dd><strong>{p.conclusion}</strong></dd>
              </dl>
            </section>
          ))}
          <section className="card">
            <h2>Method and limitations</h2>
            <ul className="small">{data.method.map((m) => <li key={m}>{m}</li>)}</ul>
          </section>
        </>
      )}
    </>
  );
}

export default function Page() {
  return <RequireAuth><InsightsPage /></RequireAuth>;
}
