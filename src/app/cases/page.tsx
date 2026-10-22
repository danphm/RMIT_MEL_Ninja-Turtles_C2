"use client";

import Link from "next/link";
import { RequireAuth, ErrorNote, useMe } from "@/components/Shell";
import { ConsentBadge, ReviewBadge, fmtDay } from "@/components/Badges";
import { Icon } from "@/components/Icon";
import { useLoad } from "@/lib/client/useApi";

interface CaseSummary {
  id: string;
  title: string;
  issue_category: string;
  organisation_name: string;
  case_status: string;
  updated_at: string;
  active_grants: number;
  evidence_count: number;
  consent: { consent_status: string };
  review_status: string;
}

function Dashboard() {
  const { me } = useMe();
  const { data, error, loading } = useLoad<{ cases: CaseSummary[] }>("/api/cases");
  return (
    <>
      <div className="page-head">
        <div>
          <h1>My cases</h1>
          <p>Only you can see this list. Each case stays private unless you share it with a specific counsellor.</p>
        </div>
        <Link className="btn" href="/cases/new"><span>Create a complaint</span><span className="arrow"><Icon name="arrowRight" size={18} /></span></Link>
      </div>
      {me?.demo_setup_open && !me.user.persona && (
        <div className="notice info">
          Running the judges&apos; walkthrough? <Link href="/demo-setup">Link this account to a fictional demo persona</Link> (for example, Alex).
        </div>
      )}
      <ErrorNote error={error} />
      {loading ? <p className="muted">Loading…</p> : data && data.cases.length === 0 ? (
        <div className="card"><p>You haven&apos;t recorded a complaint yet.</p><Link href="/cases/new">Create your first complaint</Link></div>
      ) : (
        <div className="grid grid-2">
          {data?.cases.map((c) => (
            <Link key={c.id} href={`/cases/${c.id}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="spread">
                <h3>{c.title}</h3>
                <span className="mono muted">{c.id}</span>
              </div>
              <p className="muted small">{c.issue_category} · {c.organisation_name}</p>
              <div className="row" style={{ marginBottom: ".5rem" }}>
                <ReviewBadge status={c.review_status} />
                <ConsentBadge status={c.consent.consent_status} />
              </div>
              <p className="small" style={{ margin: 0 }}>
                {c.active_grants > 0 ? <strong>Shared with {c.active_grants} counsellor{c.active_grants > 1 ? "s" : ""}</strong> : <span className="private-tag">Private: not shared</span>}
                {" · "}{c.evidence_count} evidence file{c.evidence_count === 1 ? "" : "s"} · updated {fmtDay(c.updated_at)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function Page() {
  return <RequireAuth><Dashboard /></RequireAuth>;
}
