"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RequireAuth, ErrorNote } from "@/components/Shell";
import { useApi } from "@/lib/client/useApi";
import { ConsentExplainer } from "@/components/ConsentExplainer";

const CATEGORIES = ["Hardship request delayed", "Repayment assistance delayed", "Missed follow-up", "Fees or charges", "Collections conduct", "Other"];

function NewCase() {
  const api = useApi();
  const router = useRouter();
  const [f, setF] = useState({ title: "", description: "", issue_category: "", organisation_name: "", event_date: "" });
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api<{ case?: { id: string }; error?: string }>("/api/cases", { method: "POST", json: { ...f, consent_collective: consent } });
    if (!r.ok || !r.data.case) {
      setError(r.data.error ?? "Could not save the complaint.");
      setBusy(false);
      return;
    }
    if (file) {
      const fd = new FormData();
      fd.append("file", file);
      const up = await api<{ error?: string }>(`/api/cases/${r.data.case.id}/evidence`, { method: "POST", body: fd });
      if (!up.ok) {
        router.push(`/cases/${r.data.case.id}?upload_error=${encodeURIComponent(up.data.error ?? "Upload failed")}`);
        return;
      }
    }
    router.push(`/cases/${r.data.case.id}`);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Create a complaint</h1>
          <p>Write it in your own words. You can edit it later. Nobody else can see it unless you choose to share it.</p>
        </div>
      </div>
      <form className="card" onSubmit={submit} style={{ maxWidth: 760 }}>
        <ErrorNote error={error} />
        <div className="field">
          <label htmlFor="title">Short title</label>
          <input id="title" type="text" value={f.title} onChange={set("title")} required maxLength={140} />
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="cat">What kind of issue?</label>
            <select id="cat" value={f.issue_category} onChange={set("issue_category")} required>
              <option value="">Choose…</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="date">Approximate date <span className="hint">If you know it</span></label>
            <input id="date" type="date" value={f.event_date} onChange={set("event_date")} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="org">Organisation or provider</label>
          <input id="org" type="text" value={f.organisation_name} onChange={set("organisation_name")} required maxLength={140} />
        </div>
        <div className="field">
          <label htmlFor="desc">What happened? <span className="hint">Include dates and who you spoke to, if you can.</span></label>
          <textarea id="desc" value={f.description} onChange={set("description")} required maxLength={5000} />
        </div>
        <div className="field">
          <label htmlFor="file">Supporting evidence <span className="hint">Optional. PDF, PNG, JPEG or text, 5 MB max. You can add more later.</span></label>
          <input id="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <hr />
        <fieldset style={{ border: 0, padding: 0, margin: "0 0 1rem" }}>
          <legend className="sr-only">Collective insights consent</legend>
          <ConsentExplainer />
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>Yes, include this case in collective insights. <span className="hint">Optional. Your complaint is saved either way, and you can change this later.</span></span>
          </label>
        </fieldset>
        <button className="btn" disabled={busy}>{busy ? "Saving…" : "Save my complaint"}</button>
      </form>
    </>
  );
}

export default function Page() {
  return <RequireAuth><NewCase /></RequireAuth>;
}
