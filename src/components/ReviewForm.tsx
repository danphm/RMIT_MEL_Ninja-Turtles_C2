"use client";

import { useState } from "react";
import { useApi } from "@/lib/client/useApi";
import { ErrorNote } from "./Shell";

export function ReviewForm({ caseId, evidence, onDone }: { caseId: string; evidence: { id: string; original_filename: string }[]; onDone: () => void }) {
  const api = useApi();
  const [f, setF] = useState({ evidence_item_id: "", claim_reference: "", outcome: "", rationale: "", limitations: "", conflict_declaration: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await api<{ error?: string }>(`/api/cases/${caseId}/reviews`, { method: "POST", json: f });
    if (!r.ok) return setError(r.data.error ?? "Could not record the review");
    setF({ evidence_item_id: "", claim_reference: "", outcome: "", rationale: "", limitations: "", conflict_declaration: "" });
    setError(null);
    onDone();
  }
  async function complete() {
    await api(`/api/cases/${caseId}/reviews`, { method: "POST", json: { complete: true } });
    onDone();
  }

  return (
    <form onSubmit={submit} style={{ marginTop: "1rem", borderTop: "1px solid var(--line)", paddingTop: "1rem" }}>
      <h3>Record a review</h3>
      <p className="muted small">Reviews are added to the record and never overwrite earlier ones. You are assessing one specific claim, not whether the organisation acted unlawfully.</p>
      <ErrorNote error={error} />
      <div className="field">
        <label htmlFor="coi">Conflict of interest</label>
        <select id="coi" value={f.conflict_declaration} onChange={set("conflict_declaration")} required>
          <option value="">Choose…</option>
          <option value="none">I have no conflict of interest with this member or organisation</option>
          <option value="declared">I have a conflict of interest (recuse me)</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="ev">Evidence examined</label>
        <select id="ev" value={f.evidence_item_id} onChange={set("evidence_item_id")}>
          <option value="">No specific file</option>
          {evidence.map((e) => <option key={e.id} value={e.id}>{e.original_filename}</option>)}
        </select>
      </div>
      <div className="field"><label htmlFor="cl">Specific claim examined</label><input id="cl" type="text" value={f.claim_reference} onChange={set("claim_reference")} required /></div>
      <div className="field">
        <label htmlFor="out">Outcome</label>
        <select id="out" value={f.outcome} onChange={set("outcome")} required>
          <option value="">Choose…</option>
          <option value="evidence_reviewed">Evidence reviewed: material examined</option>
          <option value="corroborated">Corroborated: material supports this claim within the stated scope</option>
          <option value="unresolved">Unresolved / disputed: incomplete or conflicting</option>
        </select>
      </div>
      <div className="field"><label htmlFor="ra">Rationale</label><textarea id="ra" value={f.rationale} onChange={set("rationale")} required style={{ minHeight: "4rem" }} /></div>
      <div className="field"><label htmlFor="li">Limitations</label><textarea id="li" value={f.limitations} onChange={set("limitations")} required style={{ minHeight: "4rem" }} /></div>
      <div className="row"><button className="btn small">Record review</button><button type="button" className="btn ghost small" onClick={complete}>Mark assignment complete</button></div>
    </form>
  );
}
