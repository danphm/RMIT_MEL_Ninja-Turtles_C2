import { route, denied } from "@/lib/session";
import { authorizeCase } from "@/lib/authz";
import { getEvidence, readEvidenceBytes } from "@/lib/evidence";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// The only way to fetch evidence bytes. Knowing an evidence id is not enough: the case-level
// decision is re-made on every download, so a revoked grant stops the next request (FR-EVID-04).
export const GET = route<Ctx>(async (_req, p, { params }) => {
  const { id } = await params;
  const e = getEvidence(id);
  if (!e) {
    audit({ actorId: p.user.id, eventType: "evidence.download", objectType: "evidence", objectId: id, outcome: "denied", metadata: { reason: "not_found_or_forbidden" } });
    return denied();
  }
  const { decision } = authorizeCase(p, e.case_id, "read_evidence");
  if (!decision.allowed) return denied();
  audit({ actorId: p.user.id, eventType: "evidence.download", objectType: "evidence", objectId: id, outcome: "success", correlationId: e.case_id, metadata: { basis: decision.basis } });
  return new Response(new Uint8Array(readEvidenceBytes(e)), {
    headers: {
      "Content-Type": e.media_type,
      "Content-Disposition": `attachment; filename="${e.original_filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
