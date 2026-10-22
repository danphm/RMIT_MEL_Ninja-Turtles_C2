"use client";

import Link from "next/link";
import { RequireAuth, ErrorNote } from "@/components/Shell";
import { fmtDay } from "@/components/Badges";
import { useLoad } from "@/lib/client/useApi";

interface Assignment { id: string; case_id: string; assignment_status: string; created_at: string; completed_at: string | null; title: string; issue_category: string; organisation_name: string }

function ReviewWorkspace() {
  const { data, error, status } = useLoad<{ assignments: Assignment[] }>("/api/reviews/assignments");
  if (status === 403) return <ErrorNote error="Your account doesn't have the reviewer role." />;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Independent review workspace</h1>
          <p>You can open only the cases assigned to you. Record what the material shows, what it doesn&apos;t, and the limits of your review. Examining material doesn&apos;t make a claim legally proven.</p>
        </div>
      </div>
      <ErrorNote error={error} />
      <section className="card">
        <h2>Your assignments</h2>
        {data?.assignments.length === 0 ? <p className="muted">Nothing assigned to you yet.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Case</th><th>Status</th><th>Assigned</th></tr></thead>
            <tbody>{data?.assignments.map((a) => (
              <tr key={a.id}>
                <td>{["assigned", "in_progress"].includes(a.assignment_status) ? <Link href={`/cases/${a.case_id}`}>{a.title}</Link> : a.title}<br /><span className="muted small">{a.issue_category} · {a.organisation_name}</span></td>
                <td><span className={`badge ${a.assignment_status === "completed" ? "ok" : a.assignment_status === "recused" ? "neutral" : "warn"}`}>{a.assignment_status.replace("_", " ")}</span></td>
                <td className="small">{fmtDay(a.created_at)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="muted small" style={{ marginTop: ".75rem" }}>Access ends when an assignment is completed or you recuse yourself.</p>
      </section>
    </>
  );
}

export default function Page() {
  return <RequireAuth><ReviewWorkspace /></RequireAuth>;
}
