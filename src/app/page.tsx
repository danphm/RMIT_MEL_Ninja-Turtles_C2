"use client";

import Link from "next/link";
import { useTideCloak } from "@tidecloak/nextjs";
import { Icon, type IconName } from "@/components/Icon";

const BENEFITS: { icon: IconName; title: string; body: string }[] = [
  { icon: "lock", title: "You decide who sees your case", body: "A verified counsellor only sees a case you share with them. You can revoke access at any time, and the next request is refused." },
  { icon: "chart", title: "Collective insight is a separate choice", body: "Your case only counts towards shared patterns if you opt in. Those patterns show counts, never your story or your documents." },
  { icon: "shield", title: "No administrator can quietly widen access", body: "Changing the rules for private cases needs several independent approvers through TideCloak. A single admin can't do it alone." },
];

/** An illustrative case card: shows what a person sees, with fictional data. */
function CasePreview() {
  return (
    <div className="preview" aria-hidden>
      <div className="preview-card">
        <div className="spread">
          <span className="eyebrow" style={{ margin: 0 }}>Example case</span>
          <span className="badge neutral">Alleged: not yet reviewed</span>
        </div>
        <h3>Hardship request ignored</h3>
        <p className="small muted">Lending · Example Credit Union</p>
        <ul className="access-list">
          <li><Icon name="check" size={18} /> Private from the start</li>
          <li><Icon name="users" size={18} /> Shared with 1 counsellor</li>
          <li><Icon name="eye" size={18} /> 3 accesses logged, 1 refused</li>
        </ul>
        <div className="row">
          <span className="progress" aria-hidden><span className="on" /><span className="on" /><span /></span>
          <span className="small muted">2 of 3 approvals for any rule change</span>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { authenticated, login } = useTideCloak();
  return (
    <>
      <section className="section hero" data-theme="forest">
        <div className="section-inner hero-grid">
          <div>
            <div className="eyebrow">For people in financial hardship</div>
            <h1>Your story. Shared evidence. No single point of control.</h1>
            <p className="lead">
              Organise a complaint, share it with a verified financial counsellor on your own terms, and add to the
              bigger picture only if you choose to.
            </p>
            <div className="row">
              {authenticated ? (
                <Link className="btn" href="/cases"><span>Go to my cases</span><span className="arrow"><Icon name="arrowRight" size={18} /></span></Link>
              ) : (
                <button className="btn" onClick={() => login()}><span>Sign in with Tide</span><span className="arrow"><Icon name="arrowRight" size={18} /></span></button>
              )}
              <Link className="btn ghost" href="#how">How it works</Link>
            </div>
          </div>
          <CasePreview />
        </div>
      </section>

      <section className="section">
        <div className="section-inner">
          <div className="eyebrow">Who controls access</div>
          <div className="section-head">
            <h2>You decide who sees your case, and no one can quietly change that</h2>
            <p>Sharing, collective insight and platform rules are three separate controls. Each one is visible to you.</p>
          </div>
          <div className="grid grid-3">
            {BENEFITS.map((b) => (
              <div key={b.title} className="card feature">
                <span className="feature-icon"><Icon name={b.icon} size={22} /></span>
                <h3>{b.title}</h3>
                <p className="muted small">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="section" data-theme="forest">
        <div className="section-inner">
          <div className="eyebrow">How it works</div>
          <div className="section-head">
            <h2>Five steps, and you can stop after any of them</h2>
            <p>Your case is private from the start. Every later step is your choice.</p>
          </div>
          <ol className="steps">
            <li><h3>Record what happened</h3><p>Add a description and supporting correspondence. Your case is private from the start.</p></li>
            <li className="stop"><h3>Choose a counsellor</h3><p>Pick from the verified directory and share one specific case, with the scope you choose.</p><span className="stop-note">You can stop here, or revoke at any time</span></li>
            <li><h3>Opt in to collective insight</h3><p>Similar consented cases are counted together. Small groups are hidden.</p></li>
            <li><h3>Independent review</h3><p>Reviewers record what the evidence does and does not support, kept separate from your own account.</p></li>
            <li><h3>See every decision</h3><p>The audit history shows who accessed your case, including attempts that were refused.</p></li>
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="section-inner">
          <div className="notice info">
            <strong>CaseCommons does not prove misconduct.</strong> Many similar complaints can point to a <em>potential</em> pattern. Only a defined
            review process can support a finding, and this prototype publishes no findings about any organisation.
          </div>
        </div>
      </section>
    </>
  );
}
