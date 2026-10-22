"use client";

import { useState } from "react";
import Link from "next/link";
import { RequireAuth, ErrorNote } from "@/components/Shell";
import { FictionalTag, fmtDay } from "@/components/Badges";
import { ShareForm } from "@/components/ShareForm";
import { useLoad } from "@/lib/client/useApi";

interface Counsellor {
  user_id: string;
  display_name: string;
  organisation: string;
  credential_description: string;
  verification_status: string;
  verification_method: string;
  verified_at: string | null;
  service_areas: string;
  contact: string;
  is_fictional: number;
}

function Directory() {
  const { data, error } = useLoad<{ counsellors: Counsellor[] }>("/api/counsellors");
  const cases = useLoad<{ cases: { id: string; title: string }[] }>("/api/cases");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [caseId, setCaseId] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const list = (data?.counsellors ?? []).filter((c) => `${c.display_name} ${c.organisation} ${c.service_areas}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Find a financial counsellor</h1>
          <p>Choosing a counsellor shares nothing by itself. You confirm one specific case, and what they can see, before any access is created.</p>
        </div>
      </div>
      <div className="notice warn small">
        <strong>Demonstration profiles.</strong> These counsellors are fictional. Their &quot;verified&quot; status is seed data: CaseCommons
        hasn&apos;t checked any real professional credential, and these aren&apos;t recommendations.
      </div>
      <ErrorNote error={error} />
      {done && <div className="notice ok">{done} <Link href={`/cases/${caseId}`}>View the case</Link></div>}
      <div className="field" style={{ maxWidth: 420 }}>
        <label htmlFor="q">Search by name, service or area of help</label>
        <input id="q" type="text" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="grid grid-2">
        {list.map((c) => {
          const verified = c.verification_status === "verified";
          return (
            <article key={c.user_id} className="card">
              <div className="spread">
                <h2 style={{ fontSize: "1.1rem" }}>{c.display_name}</h2>
                <div className="row">
                  {verified ? <span className="badge ok">Verified (demo)</span> : <span className="badge neutral">Not verified</span>}
                  {c.is_fictional ? <FictionalTag /> : null}
                </div>
              </div>
              <dl className="kv">
                <dt>Service</dt><dd>{c.organisation}</dd>
                <dt>Credential</dt><dd>{c.credential_description}</dd>
                <dt>Helps with</dt><dd>{c.service_areas}</dd>
                <dt>Contact</dt><dd>{c.contact}</dd>
                <dt>Verification</dt><dd>{c.verification_method}{c.verified_at ? ` (${fmtDay(c.verified_at)})` : ""}</dd>
              </dl>
              {verified ? (
                selected === c.user_id ? (
                  <div style={{ marginTop: "1rem" }}>
                    <div className="field">
                      <label htmlFor={`case-${c.user_id}`}>Which case?</label>
                      <select id={`case-${c.user_id}`} value={caseId} onChange={(e) => setCaseId(e.target.value)}>
                        <option value="">Choose one of your cases…</option>
                        {cases.data?.cases.map((k) => <option key={k.id} value={k.id}>{k.title} ({k.id})</option>)}
                      </select>
                    </div>
                    <ShareForm
                      caseId={caseId || null}
                      counsellors={[{ user_id: c.user_id, display_name: c.display_name, organisation: c.organisation, verification_status: c.verification_status }]}
                      fixedCounsellor={{ user_id: c.user_id, display_name: c.display_name, organisation: c.organisation, verification_status: c.verification_status }}
                      onDone={() => { setSelected(null); setDone(`Shared with ${c.display_name}.`); }}
                    />
                  </div>
                ) : (
                  <button className="btn secondary small" style={{ marginTop: "1rem" }} onClick={() => { setSelected(c.user_id); setDone(null); }}>Choose this counsellor</button>
                )
              ) : (
                <p className="muted small" style={{ marginTop: "1rem" }}>You can&apos;t share cases with this counsellor until their verification is complete.</p>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}

export default function Page() {
  return <RequireAuth><Directory /></RequireAuth>;
}
