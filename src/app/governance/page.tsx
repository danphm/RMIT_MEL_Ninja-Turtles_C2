"use client";

import { useState } from "react";
import { RequireAuth, ErrorNote, useMe } from "@/components/Shell";
import { GovBadge, fmtDate } from "@/components/Badges";
import { useApi, useLoad } from "@/lib/client/useApi";

interface GovRequest {
  id: string;
  proposed_change: string;
  request_fingerprint: string;
  approval_status: string;
  tidecloak_reference: string | null;
  approvals_recorded: number | null;
  approvals_required: number | null;
  last_verified_at: string | null;
  created_at: string;
  applied_at: string | null;
  application_status: string;
  application_error_reference: string | null;
}
interface Gov {
  protected_role: string;
  request_ttl_hours: number;
  requests: GovRequest[];
  effective_policy: { verified: true; checked_at: string; override_holders: { sub: string; display_name: string }[] } | { verified: false; error: string; checked_at: string };
  users: { id: string; sub: string; display_name: string }[];
  you_can_propose: boolean;
  tidecloak: { approval_console: string; tide_console: string; realm: string };
  events: { id: number; event_type: string; outcome: string; source: string; timestamp: string; actor_name: string | null; metadata: string | null; correlation_id: string | null }[];
}

function Progress({ have, need }: { have: number | null; need: number | null }) {
  if (need == null) return <span className="muted small">Threshold not reported yet. Verify to read it from TideCloak.</span>;
  return (
    <span className="row">
      <span className="progress" aria-hidden>{Array.from({ length: need }, (_, i) => <span key={i} className={i < (have ?? 0) ? "on" : ""} />)}</span>
      <span className="small"><strong>{have ?? 0}</strong> of <strong>{need}</strong> required approvals (reported by TideCloak)</span>
    </span>
  );
}

function GovernancePage() {
  const api = useApi();
  const { me } = useMe();
  const { data, error, reload, status } = useLoad<Gov>("/api/governance");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const [revising, setRevising] = useState<string | null>(null);
  const [reviseTarget, setReviseTarget] = useState("");
  const [probe, setProbe] = useState<string | null>(null);

  if (status === 403) return <ErrorNote error="Governance is visible to platform administrators and Tide approvers only." />;
  if (!data) return <><ErrorNote error={error} /><p className="muted">Loading…</p></>;

  const nameFor = (sub: string) => data.users.find((u) => u.sub === sub)?.display_name ?? sub;
  async function act(label: string, fn: () => Promise<{ ok: boolean; status: number; data: { error?: string } & Record<string, unknown> }>, okText: string) {
    setBusy(label);
    setMsg(null);
    try {
      const r = await fn();
      setMsg(r.ok ? { tone: "ok", text: okText } : { tone: "danger", text: (r.data.error as string) ?? `Failed (HTTP ${r.status})` });
    } finally {
      setBusy(null);
      reload();
    }
  }
  const propose = () => act("propose", () => api("/api/governance", { method: "POST", json: { target_user_id: target } }), "Submitted to TideCloak. It is now a pending change request, and nothing has changed yet.");
  const verify = (id: string) => act(id, async () => {
    const r = await api<{ verified: boolean; error?: string }>(`/api/governance/${id}/verify`, { method: "POST" });
    return { ...r, ok: r.ok, data: r.ok ? r.data : { error: `Could not verify with TideCloak: ${r.data.error}. Nothing was applied (fail closed).` } };
  }, "Checked with TideCloak.");
  const forge = (id: string) => act("forge" + id, () => api(`/api/governance/${id}/approve`, { method: "POST", json: { approved: true } }), "");
  const cancel = (id: string) => act("cancel" + id, () => api(`/api/governance/${id}/cancel`, { method: "POST" }), "Withdrawn in TideCloak and cancelled.");
  const revise = (id: string) => act("revise" + id, () => api(`/api/governance/${id}/revise`, { method: "POST", json: { target_user_id: reviseTarget } }), "The old request was withdrawn and a new one filed. Approvals don't carry over.");
  async function probeAccess() {
    const r = await api<{ error?: string; case?: { title: string }; access_basis?: string }>("/api/cases/case-002");
    setProbe(r.ok ? `ALLOWED (HTTP ${r.status}) via ${r.data.access_basis}: "${r.data.case?.title}"` : `DENIED (HTTP ${r.status}): ${r.data.error}`);
  }

  const ep = data.effective_policy;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Governance: protected access rules</h1>
          <p>Changing who can read members&apos; private cases is a <strong>protected change</strong>. CaseCommons can only <em>propose</em> it.
            TideCloak holds it until enough independent approvers have signed it in the Tide enclave. The app applies nothing on its own word.</p>
        </div>
      </div>

      {msg && msg.text && <div className={`notice ${msg.tone}`} role="status">{msg.text}</div>}

      <section className="card">
        <h2>Effective policy now</h2>
        <p className="muted small">This is read live from TideCloak&apos;s role assignments, not from CaseCommons&apos; own records. Checked {fmtDate(ep.checked_at)}.</p>
        <ul className="small">
          <li>Members can read their own cases.</li>
          <li>Counsellors can read only the cases explicitly shared with them, within the shared scope.</li>
          <li>Reviewers can read only the cases assigned to them.</li>
          <li>Platform administrators <strong>can&apos;t</strong> read private cases.</li>
          <li>
            <strong>Private-case override</strong> (<span className="mono">{data.protected_role}</span>):{" "}
            {ep.verified ? (ep.override_holders.length === 0 ? <span className="badge ok">Held by no one</span> : (
              <>held by {ep.override_holders.map((h) => <span key={h.sub} className="badge warn" style={{ marginRight: 4 }}>{h.display_name}</span>)}</>
            )) : <span className="badge danger">Could not verify with TideCloak: {ep.error}</span>}
          </li>
        </ul>
        <div className="row">
          <button className="btn ghost small" onClick={probeAccess}>Test: request Jordan&apos;s private case as me</button>
          {probe && <span className="mono small" role="status">{probe}</span>}
        </div>
        <p className="muted small" style={{ marginTop: ".5rem" }}>
          The backend enforces whatever is in your Tide-signed access token. After an approved change, sign out and back in (or wait for token refresh) to receive the new role.
          After a revocation, the role disappears when the token is next refreshed. Tokens in this realm last a few minutes.
        </p>
      </section>

      {data.you_can_propose && (
        <section className="card">
          <h2>Propose a change</h2>
          <p className="small">Grant <span className="mono">{data.protected_role}</span> (read access to <strong>every</strong> private case) to:</p>
          <div className="row">
            <label htmlFor="tgt" className="sr-only">Account</label>
            <select id="tgt" value={target} onChange={(e) => setTarget(e.target.value)} style={{ maxWidth: 360 }}>
              <option value="">Choose an account…</option>
              {data.users.map((u) => <option key={u.id} value={u.id}>{u.display_name}{u.id === me?.user.id ? " (you)" : ""}</option>)}
            </select>
            <button className="btn" disabled={!target || busy === "propose"} onClick={propose}>{busy === "propose" ? "Submitting…" : "Submit for approval"}</button>
          </div>
          <p className="muted small" style={{ marginTop: ".5rem" }}>Requests that aren&apos;t approved within {data.request_ttl_hours} hours expire and are withdrawn.</p>
        </section>
      )}

      <section className="card">
        <div className="spread">
          <h2>Requests</h2>
          <span className="small">Approvers sign in TideCloak: <a href={data.tidecloak.approval_console} target="_blank" rel="noreferrer">admin console → Change requests</a></span>
        </div>
        {data.requests.length === 0 && <p className="muted">No protected changes have been requested.</p>}
        {data.requests.map((r) => {
          const change = JSON.parse(r.proposed_change) as { role: string; target_user_id: string };
          const live = r.approval_status === "pending_approval" || r.approval_status === "approved" || r.approval_status === "draft";
          return (
            <article key={r.id} className="card flat">
              <div className="spread">
                <div>
                  <strong>Grant <span className="mono">{change.role}</span> to {nameFor(change.target_user_id)}</strong>
                  <div className="muted small">Request <span className="mono">{r.id}</span> · created {fmtDate(r.created_at)}</div>
                </div>
                <GovBadge status={r.approval_status} />
              </div>
              <div className="state-cols" style={{ marginTop: ".75rem" }}>
                <div className="state-col">
                  <h4>Requested</h4>
                  <div className="small">Override for {nameFor(change.target_user_id)}</div>
                  <div className="mono small muted" title={r.request_fingerprint}>fingerprint {r.request_fingerprint.slice(0, 16)}…</div>
                </div>
                <div className="state-col">
                  <h4>Authorisation (TideCloak)</h4>
                  {r.tidecloak_reference ? <div className="mono small">CR {r.tidecloak_reference}</div> : <div className="small">Not filed: {r.application_error_reference}</div>}
                  <Progress have={r.approvals_recorded} need={r.approvals_required} />
                  <div className="muted small">last verified {fmtDate(r.last_verified_at)}</div>
                </div>
                <div className="state-col">
                  <h4>Effective</h4>
                  {r.approval_status === "applied" ? <div className="small"><span className="badge ok">In force</span> confirmed {fmtDate(r.applied_at)}</div>
                    : r.approval_status === "application_failed" ? <div className="small"><span className="badge danger">Not in force</span> {r.application_error_reference}</div>
                    : <div className="small"><span className="badge neutral">Not in force</span> The original policy is still enforced.</div>}
                </div>
              </div>
              {live && (
                <div className="row" style={{ marginTop: ".75rem" }}>
                  {r.tidecloak_reference && <button className="btn small" disabled={busy === r.id} onClick={() => verify(r.id)}>{busy === r.id ? "Checking…" : "Check status with TideCloak"}</button>}
                  {data.you_can_propose && r.approval_status !== "approved" && <>
                    <button className="btn ghost small" onClick={() => { setRevising(revising === r.id ? null : r.id); setReviseTarget(""); }}>Change proposal</button>
                    <button className="btn danger small" onClick={() => cancel(r.id)}>Withdraw</button>
                  </>}
                  <button className="btn ghost small" title="Sends {approved:true} from the browser" onClick={() => forge(r.id)}>Try to self-approve from the browser</button>
                </div>
              )}
              {revising === r.id && (
                <div className="row" style={{ marginTop: ".75rem" }}>
                  <select value={reviseTarget} onChange={(e) => setReviseTarget(e.target.value)} style={{ maxWidth: 320 }} aria-label="New target">
                    <option value="">New target account…</option>
                    {data.users.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                  </select>
                  <button className="btn small" disabled={!reviseTarget} onClick={() => revise(r.id)}>Replace request</button>
                  <span className="muted small">The current request is withdrawn. The new one starts again at 0 approvals.</span>
                </div>
              )}
            </article>
          );
        })}
      </section>

      <section className="card">
        <h2>Governance history</h2>
        <p className="muted small">Each row is marked by source. <span className="badge info">TideCloak</span> rows record an outcome reported by TideCloak&apos;s change-request API. <span className="badge neutral">CaseCommons</span> rows record the app&apos;s own actions. The app&apos;s audit table isn&apos;t claimed to be tamper-proof.</p>
        <div className="table-wrap"><table>
          <thead><tr><th>When</th><th>Event</th><th>Source</th><th>Outcome</th><th>Actor</th><th>Request</th></tr></thead>
          <tbody>{data.events.map((e) => (
            <tr key={e.id}>
              <td className="small">{fmtDate(e.timestamp)}</td>
              <td className="mono">{e.event_type}</td>
              <td><span className={`badge ${e.source === "tidecloak" ? "info" : "neutral"}`}>{e.source === "tidecloak" ? "TideCloak" : "CaseCommons"}</span></td>
              <td><span className={`badge ${e.outcome === "denied" || e.outcome === "failed" ? "danger" : e.outcome === "success" ? "ok" : "neutral"}`}>{e.outcome}</span></td>
              <td className="small">{e.actor_name ?? "—"}</td>
              <td className="mono small">{e.correlation_id}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
    </>
  );
}

export default function Page() {
  return <RequireAuth><GovernancePage /></RequireAuth>;
}
