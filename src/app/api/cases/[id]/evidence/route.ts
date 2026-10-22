import { route, denied, badRequest } from "@/lib/session";
import { authorizeCase } from "@/lib/authz";
import { MAX_EVIDENCE_BYTES, storeEvidence, validateUpload } from "@/lib/evidence";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, p, { params }) => {
  const { id } = await params;
  const { decision } = authorizeCase(p, id, "upload_evidence");
  if (!decision.allowed) return denied();
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_EVIDENCE_BYTES + 64 * 1024) return badRequest("Files must be 5 MB or smaller.");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return badRequest("Attach a file.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const v = validateUpload(file.name, file.type, bytes);
  if (!v.ok) {
    audit({ actorId: p.user.id, eventType: "evidence.upload_rejected", objectType: "case", objectId: id, outcome: "denied", correlationId: id, metadata: { reason: v.error } });
    return badRequest(v.error);
  }
  const evidenceId = storeEvidence(id, p.user.id, file.name, file.type, bytes);
  return Response.json({ id: evidenceId }, { status: 201 });
});
