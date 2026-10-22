"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RequireAuth, ErrorNote } from "@/components/Shell";
import { ConsentBadge, ReviewBadge, fmtDate, fmtDay } from "@/components/Badges";
import { Icon } from "@/components/Icon";
import { ShareForm, type Counsellor } from "@/components/ShareForm";
import { ConsentExplainer } from "@/components/ConsentExplainer";
import { ReviewForm } from "@/components/ReviewForm";
import { useApi, useDownload, useLoad } from "@/lib/client/useApi";

interface Detail {
  case: { id: string; title: string; description: string; issue_category: string; organisation_name: string; event_date: string | null; case_status: string; created_at: string; updated_at: string; owner_name: string | null };
  access_basis: "owner" | "counsellor_grant" | "review_assignment" | "governed_override";
  permissions: Record<string, boolean>;
  review_status: string;
  evidence: { id: string; original_filename: string; media_type: string; file_size: number; uploaded_at: string; version: number; review_status: string; uploaded_by_name: string }[] | null;
  reviews: { id: string; claim_reference: string; outcome: string; rationale: string; limitations: string; reviewed_at: string; evidence_name: string | null; reviewer_name: string }[];
  notes: { id: string; body: string; created_at: string; author: string }[] | null;
  grants: { id: string; permission_scope: string; status: string; created_at: string; expires_at: string | null; revoked_at: string | null; recipient_name: string; recipient_organisation: string | null }[] | null;
  consent: { consent_status: string; policy_version: string; recorded_at: string | null } | null;
}

const BASIS: Record<string, string> = {
  counsellor_grant: "You can see this case because its owner shared it with you. If they revoke access, your next request will be refused.",
  review_assignment: "You can see this case because it is assigned to you for independent review.",
  governed_override: "You are viewing this case under the protected override policy. That policy took effect only after TideCloak quorum approval, and this access is audited.",
};

function CaseDetail({ id }: { id: string }) {
  const api = useApi();
  const download = useDownload();
  const params = useSearchParams();
  const { data, error, status, reload, loading } = useLoad<Detail>(`/api/cases/${id}`);
  const counsellors = useLoad<{ counsellors: Counsellor[] }>(data?.permissions.manage_access ? "/api/counsellors" : null);
  const auditLog = useLoad<{ events: { id: number; event_type: string; outcome: string; timestamp: string; actor_name: string | null; metadata: string | null }[] }>(
    data?.permissions.manage_access ? `/api/cases/${id}/audit` : null
  );
  const [msg, setMsg] = useState<string | null>(params.get("upload_error"));
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const refresh = () => { reload(); auditLog.reload(); };

  if (loading) return <p className="muted">Loading…</p>;
  if (status === 404) {
    return (
      <div className="card" role="alert">
        <h1>Access restricted</h1>
        <p>This case is private, or it doesn&apos;t exist. CaseCommons doesn&apos;t say which, so case numbers can&apos;t be guessed.</p>
        <p className="muted small">The attempt has been recorded in the audit history.</p>
        <Link href="/cases">Back to my cases</Link>
      </div>
    );
  }
  if (!data) return <ErrorNote error={error} />;
  const c = data.case;
  const owner = data.access_basis === "owner";

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    const r = await api<{ error?: string }>(`/api/cases/${id}/evidence`, { method: "POST", body: fd });
    setMsg(r.ok ? null : r.data.error ?? "Upload failed");
    e.target.value = "";
    refresh();
  }
  async function revoke(grantId: string) {
    await api(`/api/grants/${grantId}/revoke`, { method: "POST" });
    refresh();
  }
  async function consent(granted: boolean) {
    await api(`/api/cases/${id}/consent`, { method: "PUT", json: { granted } });
    refresh();
  }
  async function addNote() {
    const r = await api<{ error?: string }>(`/api/cases/${id}/notes`, { method: "POST", json: { body: note } });
    if (r.ok) setNote("");
    else setMsg(r.data.error ?? "Could not add note");
    refresh();
  }
  async function requestDeletion() {
    if (!confirm("Request deletion of this case? All counsellor access will be revoked immediately.")) return;
    await api(`/api/cases/${id}/deletion-request`, { method: "POST" });
    refresh();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted small" style={{ margin: 0 }}><Link href={owner ? "/cases" : data.access_basis === "counsellor_grant" ? "/counsellor" : "/review"}><Icon name="arrowLeft" size={16} /> Back</Link> · <span className="mono">{c.id}</span></p>
          <h1>{c.title}</h1>
          <div className="row">
            <ReviewBadge status={data.review_status} />
            {data.consent && <ConsentBadge status={data.consent.consent_status} />}
            {c.case_status === "deletion_requested" && <span className="badge danger">Deletion requested</span>}
          </div>
        </div>
        {owner && (
          <div className="row">
            <button className="btn ghost small" onClick={() => download(`/api/cases/${id}/export`, `${id}-export.json`)}>Export my data</button>
            {c.case_status !== "deletion_requested" && <button className="btn danger small" onClick={requestDeletion}>Request deletion</button>}
          </div>
        )}
      </div>
      {!owner && <div className="notice info">{BASIS[data.access_basis]}</div>}
      <ErrorNote error={msg} />

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="stack">
          <section className="card">
            <div className="spread"><h2>Reported by {owner ? "you" : c.owner_name ?? "the member"}</h2>{data.permissions.edit && !editing && <button className="btn ghost small" onClick={() => setEditing(true)}>Edit</button>}</div>
            {editing ? <EditCase id={id} c={c} onDone={() => { setEditing(false); refresh(); }} /> : (
              <div className="reported">
                <p style={{ whiteSpace: "pre-wrap" }}>{c.description}</p>
                <dl className="kv">
                  <dt>Issue</dt><dd>{c.issue_category}</dd>
                  <dt>Organisation</dt><dd>{c.organisation_name}</dd>
                  <dt>Approximate date</dt><dd>{fmtDay(c.event_date)}</dd>
                  <dt>Last updated</dt><dd>{fmtDate(c.updated_at)}</dd>
                </dl>
              </div>
            )}
          </section>

          <section className="card">
            <h2>Independent review</h2>
            <p className="muted small">These are reviewers&apos; findings, kept separate from the member&apos;s own account. A review covers only the claim and material it names.</p>
            {data.reviews.length === 0 ? <p className="small">No independent review yet. The claims in this case are <strong>alleged</strong>.</p> : data.reviews.map((r) => (
              <div key={r.id} className="reviewed" style={{ marginBottom: "1rem" }}>
                <div className="row"><ReviewBadge status={r.outcome} /><span className="muted small">{r.reviewer_name} · {fmtDate(r.reviewed_at)}</span></div>
                <p className="small" style={{ margin: ".4rem 0" }}><strong>Claim examined:</strong> {r.claim_reference}{r.evidence_name ? <> · <em>{r.evidence_name}</em></> : null}</p>
                <p className="small" style={{ margin: ".2rem 0" }}><strong>Rationale:</strong> {r.rationale}</p>
                <p className="small" style={{ margin: ".2rem 0" }}><strong>Limitations:</strong> {r.limitations}</p>
              </div>
            ))}
            {data.permissions.review && data.evidence && <ReviewForm caseId={id} evidence={data.evidence} onDone={refresh} />}
          </section>

          <section className="card">
            <h2>Supporting evidence</h2>
            {data.evidence === null ? (
              <p className="small muted">Your access to this case doesn&apos;t include evidence files.</p>
            ) : data.evidence.length === 0 ? <p className="small">No files yet.</p> : (
              <div className="table-wrap"><table>
                <thead><tr><th>File</th><th>Added</th><th>Review</th><th></th></tr></thead>
                <tbody>{data.evidence.map((e) => (
                  <tr key={e.id}>
                    <td>{e.original_filename}{e.version > 1 && <span className="badge neutral">v{e.version}</span>}<br /><span className="muted small">{Math.ceil(e.file_size / 1024)} KB · by {e.uploaded_by_name}</span></td>
                    <td className="small">{fmtDay(e.uploaded_at)}</td>
                    <td><ReviewBadge status={e.review_status} /></td>
                    <td><button className="btn secondary small" onClick={() => download(`/api/evidence/${e.id}`, e.original_filename).catch((err) => setMsg(err.message))}>Download</button></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
            {data.permissions.upload_evidence && (
              <div className="field" style={{ marginTop: "1rem" }}>
                <label htmlFor="up">Add a file <span className="hint">PDF, PNG, JPEG or text, 5 MB max. A file with the same name is saved as a new version.</span></label>
                <input id="up" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" onChange={upload} />
              </div>
            )}
          </section>

          {data.notes && (
            <section className="card">
              <h2>Case notes</h2>
              {data.notes.length === 0 ? <p className="small muted">No notes yet.</p> : (
                <ul className="timeline">{data.notes.map((n) => <li key={n.id}><strong>{n.author}</strong> · <span className="muted">{fmtDate(n.created_at)}</span><br />{n.body}</li>)}</ul>
              )}
              {data.permissions.add_note && (
                <div style={{ marginTop: ".75rem" }}>
                  <label htmlFor="note">Add a note</label>
                  <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: "4rem" }} />
                  <button className="btn small" style={{ marginTop: ".5rem" }} disabled={!note.trim()} onClick={addNote}>Add note</button>
                </div>
              )}
            </section>
          )}
        </div>

        {owner && (
          <div className="stack">
            <section className="card">
              <h2>Who can see this case</h2>
              <ul className="timeline">
                <li><strong>You</strong> (owner)</li>
                {data.grants?.filter((g) => g.status === "active").map((g) => (
                  <li key={g.id} className="spread">
                    <span><strong>{g.recipient_name}</strong><br /><span className="muted small">{g.recipient_organisation} · {g.permission_scope.replace(/,/g, ", ")} · since {fmtDay(g.created_at)}{g.expires_at ? ` · ends ${fmtDay(g.expires_at)}` : ""}</span></span>
                    <button className="btn danger small" onClick={() => revoke(g.id)}>Revoke</button>
                  </li>
                ))}
              </ul>
              <p className="muted small" style={{ marginTop: ".5rem" }}>Platform administrators can&apos;t see your case. Being a verified counsellor doesn&apos;t give anyone access to it either.</p>
              <details style={{ marginTop: ".75rem" }}>
                <summary className="btn secondary small">Share with a counsellor</summary>
                <div style={{ marginTop: "1rem" }}>
                  <ShareForm caseId={id} counsellors={counsellors.data?.counsellors ?? []} onDone={refresh} />
                </div>
              </details>
              {(data.grants?.filter((g) => g.status !== "active").length ?? 0) > 0 && (
                <details style={{ marginTop: ".75rem" }}><summary className="small">Past access</summary>
                  <ul className="timeline">{data.grants!.filter((g) => g.status !== "active").map((g) => (
                    <li key={g.id} className="small">{g.recipient_name}: {g.status} {fmtDate(g.revoked_at)}</li>
                  ))}</ul>
                </details>
              )}
            </section>

            <section className="card">
              <h2>Collective insights</h2>
              <ConsentExplainer />
              <div className="spread">
                <ConsentBadge status={data.consent?.consent_status ?? "not_given"} />
                {data.consent?.consent_status === "granted"
                  ? <button className="btn ghost small" onClick={() => consent(false)}>Withdraw consent</button>
                  : <button className="btn small" onClick={() => consent(true)}>Include this case</button>}
              </div>
            </section>

            <section className="card">
              <h2>Activity on this case</h2>
              <p className="muted small">Includes refused access attempts. Document contents are never recorded.</p>
              <ul className="timeline">
                {auditLog.data?.events.map((e) => (
                  <li key={e.id}>
                    <span className={`badge ${e.outcome === "denied" ? "danger" : e.outcome === "success" ? "ok" : "neutral"}`}>{e.outcome}</span>{" "}
                    <strong>{e.event_type}</strong> · {e.actor_name ?? "system"}<br /><span className="muted small">{fmtDate(e.timestamp)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </>
  );
}

function EditCase({ id, c, onDone }: { id: string; c: Detail["case"]; onDone: () => void }) {
  const api = useApi();
  const [f, setF] = useState({ title: c.title, description: c.description, issue_category: c.issue_category, organisation_name: c.organisation_name, event_date: c.event_date ?? "" });
  const [error, setError] = useState<string | null>(null);
  async function save() {
    const r = await api<{ error?: string }>(`/api/cases/${id}`, { method: "PATCH", json: f });
    if (!r.ok) return setError(r.data.error ?? "Could not save");
    onDone();
  }
  return (
    <div>
      <ErrorNote error={error} />
      <div className="field"><label htmlFor="et">Title</label><input id="et" type="text" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      <div className="field"><label htmlFor="ed">What happened</label><textarea id="ed" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      <div className="field"><label htmlFor="eo">Organisation</label><input id="eo" type="text" value={f.organisation_name} onChange={(e) => setF({ ...f, organisation_name: e.target.value })} /></div>
      <p className="muted small">Editing your account doesn&apos;t change any independent review that has already been recorded.</p>
      <div className="row"><button className="btn small" onClick={save}>Save</button><button className="btn ghost small" onClick={onDone}>Cancel</button></div>
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RequireAuth><CaseDetail id={id} /></RequireAuth>;
}
