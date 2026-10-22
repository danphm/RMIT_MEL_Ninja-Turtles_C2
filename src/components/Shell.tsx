"use client";

import { useTideCloak } from "@tidecloak/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLoad } from "@/lib/client/useApi";
import { ROLES } from "@/lib/roles";
import { ProfileOnboarding } from "./ProfileOnboarding";
import { Icon } from "./Icon";
import tcConfig from "../../data/tidecloak.json";

export interface Me {
  user: { id: string; display_name: string; persona: string | null; is_fictional: boolean };
  roles: string[];
  counsellor_profile: { organisation: string; verification_status: string } | null;
  demo_setup_open: boolean;
}

const MeContext = createContext<{ me: Me | null; reload: () => void }>({ me: null, reload: () => {} });
export const useMe = () => useContext(MeContext);
export const hasRole = (me: Me | null, role: string) => !!me?.roles.includes(role);
const TIDE_ADMIN = "realm-management:tide-realm-admin";

export function Shell({ children }: { children: ReactNode }) {
  const { authenticated, isInitializing, login, logout } = useTideCloak();
  const { data: me, reload } = useLoad<Me>(authenticated ? "/api/me" : null);
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [path]);

  const links: { href: string; label: string; show: boolean }[] = [
    { href: "/cases", label: "My cases", show: authenticated },
    { href: "/counsellors", label: "Counsellors", show: authenticated },
    { href: "/counsellor", label: "Counsellor workspace", show: hasRole(me ?? null, ROLES.counsellor) },
    { href: "/review", label: "Review workspace", show: hasRole(me ?? null, ROLES.reviewer) },
    { href: "/insights", label: "Collective insights", show: authenticated },
    { href: "/governance", label: "Governance", show: hasRole(me ?? null, ROLES.platformAdmin) || hasRole(me ?? null, TIDE_ADMIN) },
    { href: "/admin", label: "Admin", show: hasRole(me ?? null, ROLES.platformAdmin) },
    { href: "/audit", label: "Audit", show: hasRole(me ?? null, ROLES.platformAdmin) },
  ];
  const visible = links.filter((l) => l.show);

  return (
    <MeContext.Provider value={{ me: me ?? null, reload }}>
      <a href="#main" className="skip-link">Skip to main content</a>
      <div className="demo-banner" role="note">
        <strong>Demonstration prototype.</strong> All people, organisations, cases and counsellor profiles are fictional. Nothing here is a real complaint or a finding of misconduct.
      </div>
      <header className="header" data-theme="forest">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="CaseCommons home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="brand-mark" /> CaseCommons
          </Link>
          {visible.length > 0 && (
            <button className="menu-toggle" aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen((o) => !o)}>
              <Icon name={menuOpen ? "close" : "menu"} /> <span>Menu</span>
            </button>
          )}
          <nav id="main-nav" className={menuOpen ? "nav open" : "nav"} aria-label="Main">
            {visible.map((l) => (
              <Link key={l.href} href={l.href} aria-current={path === l.href || path.startsWith(l.href + "/") ? "page" : undefined}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="whoami">
            {isInitializing ? null : authenticated ? (
              <>
                <span>{me?.user.display_name ?? "Signed in"}</span>
                <button className="btn ghost small" onClick={() => logout()}>Sign out</button>
              </>
            ) : (
              <button className="btn small" onClick={() => login()}><span>Sign in with Tide</span><span className="arrow"><Icon name="arrowRight" size={18} /></span></button>
            )}
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="site-footer" data-theme="forest">
        <div className="footer-inner">
          <div className="help">
            <Icon name="phone" size={22} />
            <div>
              <strong>Need to talk to someone now?</strong>
              <p>The National Debt Helpline offers free, confidential financial counselling: <a href="tel:1800007007">1800 007 007</a>, weekdays 9:30am to 4:30pm.</p>
            </div>
          </div>
          <p className="small muted">CaseCommons is a demonstration prototype. It stores your case privately, shares it only with people you choose, and does not prove misconduct.</p>
        </div>
      </footer>
      <ProfileOnboarding baseUrl={tcConfig["auth-server-url"]} realm={tcConfig.realm} onDone={reload} />
    </MeContext.Provider>
  );
}

/** UI gating only: the API enforces everything. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { authenticated, isInitializing, login } = useTideCloak();
  useEffect(() => {
    if (!isInitializing && !authenticated) login();
  }, [isInitializing, authenticated, login]);
  if (isInitializing || !authenticated) return <p className="muted">Checking your sign-in…</p>;
  return <>{children}</>;
}

export function ErrorNote({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <div className="notice danger" role="alert">{error}</div>;
}
