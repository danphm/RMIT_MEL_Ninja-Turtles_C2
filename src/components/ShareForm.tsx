"use client";

import { useState } from "react";
import { useApi } from "@/lib/client/useApi";
import { ErrorNote } from "./Shell";

export interface Counsellor {
  user_id: string;
  display_name: string;
  organisation: string;
  verification_status: string;
}

/** Owner-side grant creation, with the scope spelled out before confirming (Journey B step 5). */
export function ShareForm({
  caseId,
  counsellors,
  fixedCounsellor,
  onDone,
}: {
  caseId: string | null;
  counsellors: Counsellor[];
  fixedCounsellor?: Counsellor;
  onDone: () => void;
}) {
  const api = useApi();
  const [who, setWho] = useState(fixedCounsellor?.user_id ?? "");
  const [evidence, setEvidence] = useState(true);
  const [notes, setNotes] = useState(false);
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verified = counsellors.filter((c) => c.verification_status === "verified");
  const chosen = verified.find((c) => c.user_id === who);

  async function confirm() {
    if (!caseId) return setError("Choose one of your cases first.");
    setBusy(true);
    setError(null);
    const scopes = [evidence && "evidence", notes && "notes"].filter(Boolean);
    const r = await api<{ error?: string }>(`/api/cases/${caseId}/grants`, {
      method: "POST",
      json: { recipient_user_id: who, scopes, expires_at: expires ? new Date(expires + "T23:59:59").toISOString() : null },
    });
    setBusy(false);
    if (!r.ok) return setError(r.data.error ?? "Could not share the case.");
    onDone();
  }

  return (
    <div>
      <ErrorNote error={error} />
      {!fixedCounsellor && (
        <div className="field">
          <label htmlFor="who">Verified counsellor</label>
          <select id="who" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Choose…</option>
            {verified.map((c) => <option key={c.user_id} value={c.user_id}>{c.display_name} ({c.organisation})</option>)}
          </select>
        </div>
      )}
      <div className="field">
        <span style={{ fontWeight: 500, fontSize: 14 }}>What they can see</span>
        <label className="check"><input type="checkbox" checked disabled /> <span>Case details: title, description, organisation and dates</span></label>
        <label className="check"><input type="checkbox" checked={evidence} onChange={(e) => setEvidence(e.target.checked)} /> <span>Supporting evidence files (they can download them)</span></label>
        <label className="check"><input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} /> <span>Add notes to this case</span></label>
      </div>
      <div className="field" style={{ maxWidth: 260 }}>
        <label htmlFor="exp">Access ends <span className="hint">Optional. Leave blank to keep access until you revoke it.</span></label>
        <input id="exp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
      </div>
      {chosen && (
        <div className="notice warn small">
          You are about to let <strong>{chosen.display_name}</strong> see <strong>this one case only</strong>
          {evidence ? ", including its evidence files" : ", without its evidence files"}. They can&apos;t see your other cases
          or share this one with anyone else. You can revoke access at any time. Files they have already downloaded can&apos;t be recalled.
        </div>
      )}
      <button className="btn" disabled={!who || busy} onClick={confirm}>{busy ? "Sharing…" : "Confirm and share"}</button>
    </div>
  );
}
