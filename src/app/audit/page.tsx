"use client";

import { useState } from "react";
import { RequireAuth, ErrorNote } from "@/components/Shell";
import { fmtDate } from "@/components/Badges";
import { useLoad } from "@/lib/client/useApi";

interface Ev { id: number; event_type: string; object_type: string | null; object_id: string | null; outcome: string; source: string; timestamp: string; actor_name: string | null; correlation_id: string | null; metadata: string | null }

function AuditPage() {
  const { data, error, status } = useLoad<{ events: Ev[] }>("/api/audit");
  const [filter, setFilter] = useState("");
  if (status === 403) return <ErrorNote error="Audit history is available to platform administrators." />;
  const rows = (data?.events ?? []).filter((e) => !filter || e.outcome === filter || e.event_type.startsWith(filter));
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit history</h1>
          <p>Security and governance events, newest first. Rows hold identifiers and outcomes only. Document contents, descriptions and tokens are never recorded.</p>
        </div>
        <div>
          <label htmlFor="f" className="sr-only">Filter</label>
          <select id="f" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All events</option>
            <option value="denied">Denied only</option>
            <option value="case.">Case access</option>
            <option value="access.">Grants and revocations</option>
            <option value="consent.">Consent</option>
            <option value="review.">Reviews</option>
            <option value="governance.">Governance</option>
          </select>
        </div>
      </div>
      <div className="notice info small">This table is append-only: the app has no edit or delete endpoint, and database triggers refuse changes.
        It is <strong>not</strong> tamper-proof against someone with direct access to the database file. Rows marked <span className="badge info">TideCloak</span> record
        outcomes reported by TideCloak&apos;s change-request API. TideCloak keeps its own authoritative record of approvals.</div>
      <ErrorNote error={error} />
      <div className="card table-wrap">
        <table>
          <thead><tr><th>When</th><th>Event</th><th>Outcome</th><th>Actor</th><th>Object</th><th>Source</th><th>Details</th></tr></thead>
          <tbody>{rows.map((e) => (
            <tr key={e.id}>
              <td className="small">{fmtDate(e.timestamp)}</td>
              <td className="mono">{e.event_type}</td>
              <td><span className={`badge ${e.outcome === "denied" || e.outcome === "failed" ? "danger" : e.outcome === "success" ? "ok" : "neutral"}`}>{e.outcome}</span></td>
              <td className="small">{e.actor_name ?? "system"}</td>
              <td className="mono small">{e.object_type}:{e.object_id}</td>
              <td><span className={`badge ${e.source === "tidecloak" ? "info" : "neutral"}`}>{e.source === "tidecloak" ? "TideCloak" : "CaseCommons"}</span></td>
              <td className="mono small" style={{ maxWidth: 280, wordBreak: "break-word" }}>{e.metadata}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

export default function Page() {
  return <RequireAuth><AuditPage /></RequireAuth>;
}
