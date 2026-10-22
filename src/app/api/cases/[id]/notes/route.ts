import { route, denied, badRequest } from "@/lib/session";
import { authorizeCase } from "@/lib/authz";
import { getDb, newId, nowIso } from "@/lib/db";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, p, { params }) => {
  const { id } = await params;
  const { decision } = authorizeCase(p, id, "add_note");
  if (!decision.allowed) return denied();
  const body = (await req.json().catch(() => ({}))) as { body?: string };
  const text = (body.body ?? "").trim().slice(0, 2000);
  if (!text) return badRequest("Write a note.");
  const noteId = newId("note");
  getDb().prepare("INSERT INTO case_notes (id, case_id, author_user_id, body, created_at) VALUES (?, ?, ?, ?, ?)").run(noteId, id, p.user.id, text, nowIso());
  audit({ actorId: p.user.id, eventType: "case.note_added", objectType: "case", objectId: id, outcome: "success", correlationId: id });
  return Response.json({ id: noteId }, { status: 201 });
});
