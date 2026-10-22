"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RequireAuth, ErrorNote, useMe } from "@/components/Shell";
import { useApi, useLoad } from "@/lib/client/useApi";
import { ROLE_LABELS } from "@/lib/roles";

interface Persona { persona: string; display_name: string; claimed: number; is_counsellor: number }

function DemoSetup() {
  const api = useApi();
  const router = useRouter();
  const { me, reload: reloadMe } = useMe();
  const { data, error, reload } = useLoad<{ open: boolean; personas: Persona[] }>("/api/demo/claim");
  const [err, setErr] = useState<string | null>(null);

  async function claim(persona: string) {
    const r = await api<{ error?: string }>("/api/demo/claim", { method: "POST", json: { persona } });
    if (!r.ok) return setErr(r.data.error ?? "Failed");
    reloadMe();
    reload();
    router.push("/cases");
  }

  if (data && !data.open) return <div className="card"><h1>Demo setup is closed</h1><p>Set DEMO_SETUP_OPEN=true on the server to use it.</p></div>;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Demo setup</h1>
          <p>Link this Tide account to one fictional persona from the seed data, so the walkthrough has Alex&apos;s case, a counsellor profile and so on.</p>
        </div>
      </div>
      <div className="notice warn small">
        A persona only links <strong>app data</strong> (cases and the counsellor profile). It <strong>doesn&apos;t</strong> give you any role.
        Counsellor, reviewer and administrator powers come only from realm roles in your Tide-signed token, and in this realm
        those roles are assigned through TideCloak&apos;s governed change requests.
      </div>
      <p className="small">Your token currently carries: {me?.roles.filter((r) => ROLE_LABELS[r]).map((r) => <span key={r} className="badge accent" style={{ marginRight: 4 }}>{ROLE_LABELS[r]}</span>)}</p>
      <ErrorNote error={err ?? error} />
      <div className="grid grid-3">
        {data?.personas.map((p) => (
          <div key={p.persona} className="card">
            <h3>{p.display_name}</h3>
            <p className="mono small muted">{p.persona}</p>
            {p.claimed ? <span className="badge neutral">Already linked</span> : <button className="btn small" onClick={() => claim(p.persona)}>Link to my account</button>}
          </div>
        ))}
      </div>
    </>
  );
}

export default function Page() {
  return <RequireAuth><DemoSetup /></RequireAuth>;
}
