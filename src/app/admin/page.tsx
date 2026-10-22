"use client";

import { useState } from "react";
import { RequireAuth, ErrorNote, useMe } from "@/components/Shell";
import { fmtDay } from "@/components/Badges";
import { useApi, useLoad } from "@/lib/client/useApi";

interface AdminData {
  assignments: { id: string; case_id: string; assignment_status: string; created_at: string; reviewer_name: string }[];
  reviewers: { id: string; display_name: string }[];
  cases: { id: string; issue_category: string; case_status: string; created_at: string }[];
}

function AdminPage() {
  const api = useApi();
  const { me } = useMe();
  const { data, error, reload, status } = useLoad<AdminData>("/api/admin/review-assignments");
  const [caseId, setCaseId] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  if (status === 403) return <ErrorNote error="This page is for platform administrators." />;

  async function assign() {
    const r = await api<{ error?: string }>("/api/admin/review-assignments", { method: "POST", json: { case_id: caseId, reviewer_user_id: reviewer } });
    setMsg(r.ok ? { tone: "ok", text: "Review assigned." } : { tone: "danger", text: r.data.error ?? "Failed" });
    reload();
  }
  async function reset() {
    if (!confirm("Reset all CaseCommons demo data? TideCloak roles are not changed.")) return;
    const r = await api<{ error?: string }>("/api/demo/reset", { method: "POST" });
    setMsg(r.ok ? { tone: "ok", text: "Demo data reset. Everyone needs to claim their persona again at /demo-setup." } : { tone: "danger", text: r.data.error ?? "Failed" });
    reload();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Platform administration</h1>
          <p>Operational tasks only. You can route review work by case number and category, but you can&apos;t read case contents. That needs the protected override, which you can&apos;t give yourself.</p>
        </div>
      </div>
      {msg && <div className={`notice ${msg.tone}`}>{msg.text}</div>}
      <ErrorNote error={error} />
      <section className="card">
        <h2>Assign an independent review</h2>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="c">Case</label>
            <select id="c" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              <option value="">Choose…</option>
              {data?.cases.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.issue_category}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="r">Reviewer <span className="hint">Accounts that signed in with the reviewer role</span></label>
            <select id="r" value={reviewer} onChange={(e) => setReviewer(e.target.value)}>
              <option value="">Choose…</option>
              {data?.reviewers.map((r) => <option key={r.id} value={r.id}>{r.display_name}</option>)}
            </select>
          </div>
        </div>
        <button className="btn" disabled={!caseId || !reviewer} onClick={assign}>Assign</button>
        <p className="muted small" style={{ marginTop: ".5rem" }}>The server refuses an assignment if the reviewer owns the case, is you, or currently has counsellor access to it.</p>
        <hr />
        <div className="table-wrap"><table>
          <thead><tr><th>Case</th><th>Reviewer</th><th>Status</th><th>Assigned</th></tr></thead>
          <tbody>{data?.assignments.map((a) => <tr key={a.id}><td className="mono">{a.case_id}</td><td>{a.reviewer_name}</td><td>{a.assignment_status}</td><td className="small">{fmtDay(a.created_at)}</td></tr>)}</tbody>
        </table></div>
      </section>
      {me?.demo_setup_open && (
        <section className="card">
          <h2>Demo reset</h2>
          <p className="small">Restores the fictional seed data so judges can watch the walkthrough again. Override grants in TideCloak are governed, so they stay as they are.
            To remove one, use TideCloak, where removing it also needs quorum approval.</p>
          <button className="btn danger" onClick={reset}>Reset demo data</button>
        </section>
      )}
    </>
  );
}

export default function Page() {
  return <RequireAuth><AdminPage /></RequireAuth>;
}
