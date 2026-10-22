const REVIEW: Record<string, [string, string]> = {
  alleged: ["Alleged: not yet reviewed", "neutral"],
  evidence_reviewed: ["Evidence reviewed", "info"],
  corroborated: ["Corroborated (stated scope)", "ok"],
  unresolved: ["Unresolved / disputed", "warn"],
};

export function ReviewBadge({ status }: { status: string }) {
  const [label, tone] = REVIEW[status] ?? [status, "neutral"];
  return <span className={`badge ${tone}`}>{label}</span>;
}

const CONSENT: Record<string, [string, string]> = {
  granted: ["Included in collective insights", "accent"],
  withdrawn: ["Consent withdrawn", "neutral"],
  not_given: ["Not included in collective insights", "neutral"],
};

export function ConsentBadge({ status }: { status: string }) {
  const [label, tone] = CONSENT[status] ?? [status, "neutral"];
  return <span className={`badge ${tone}`}>{label}</span>;
}

const GOV: Record<string, [string, string]> = {
  draft: ["Not submitted (TideCloak unavailable)", "danger"],
  pending_approval: ["Pending approval in TideCloak", "warn"],
  approved: ["Approved, effect not yet confirmed", "info"],
  applied: ["Applied and confirmed", "ok"],
  rejected: ["Rejected", "danger"],
  cancelled: ["Cancelled", "neutral"],
  expired: ["Expired", "neutral"],
  application_failed: ["Application failed", "danger"],
};

export function GovBadge({ status }: { status: string }) {
  const [label, tone] = GOV[status] ?? [status, "neutral"];
  return <span className={`badge ${tone}`}>{label}</span>;
}

export function FictionalTag() {
  return <span className="badge warn" title="Demonstration data">Demo profile</span>;
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "—";
export const fmtDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { dateStyle: "medium" }) : "—";
