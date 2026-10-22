"use client";

import Link from "next/link";
import { useState } from "react";
import { RequireAuth, ErrorNote } from "@/components/Shell";
import { fmtDay } from "@/components/Badges";
import { useApi, useLoad } from "@/lib/client/useApi";

interface Shared { id: string; title: string; issue_category: string; organisation_name: string; permission_scope: string; shared_at: string; expires_at: string | null; owner_name: string }

function Workspace() {
  const api = useApi();
  const { data, error, status } = useLoad<{ verified: boolean; cases: Shared[] }>("/api/counsellor/cases");
  const [probe, setProbe] = useState("case-002");
  const [probeResult, setProbeResult] = useState<string | null>(null);

  async function tryOpen() {
    const r = await api<{ error?: string; case?: { title: string } }>(`/api/cases/${encodeURIComponent(probe)}`);
    setProbeResult(r.ok ? `Allowed (HTTP ${r.status}): "${r.data.case?.title}"` : `Refused by the server (HTTP ${r.status}): ${r.data.error}`);
  }

  if (status === 403) return <ErrorNote error="Your account doesn't have the counsellor role. Roles are granted in TideCloak through its governed approval process." />;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Counsellor workspace</h1>
          <p>Only cases a member has shared with you appear here. There is no directory of everyone&apos;s cases, and being verified doesn&apos;t open any case.</p>
        </div>
      </div>
      <ErrorNote error={error} />
      {data && !data.verified && <div className="notice warn">Your counsellor profile isn&apos;t verified, so no cases can be shared with you.</div>}
      <section className="card">
        <h2>Shared with you</h2>
        {data?.cases.length === 0 ? <p className="muted">No member has shared a case with you right now.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Case</th><th>Member</th><th>Your access</th><th>Since</th></tr></thead>
            <tbody>{data?.cases.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/cases/${c.id}`}>{c.title}</Link><br /><span className="muted small">{c.issue_category} · {c.organisation_name}</span></td>
                <td>{c.owner_name}</td>
                <td className="small">{c.permission_scope.replace(/,/g, ", ")}{c.expires_at ? <><br />until {fmtDay(c.expires_at)}</> : null}</td>
                <td className="small">{fmtDay(c.shared_at)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      <section className="card">
        <h2>Check: open a case that wasn&apos;t shared with you</h2>
        <p className="muted small">This sends a real API request, the same as typing the case URL. The server decides; the page only shows the answer.</p>
        <div className="row">
          <label htmlFor="probe" className="sr-only">Case id</label>
          <input id="probe" type="text" value={probe} onChange={(e) => setProbe(e.target.value)} style={{ maxWidth: 200 }} />
          <button className="btn secondary small" onClick={tryOpen}>Request this case</button>
        </div>
        {probeResult && <p className="mono" style={{ marginTop: ".75rem" }} role="status">{probeResult}</p>}
      </section>
    </>
  );
}

export default function Page() {
  return <RequireAuth><Workspace /></RequireAuth>;
}
