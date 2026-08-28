import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth-http";
import { prisma } from "@/lib/db";
import { deleteNoteForManager, MailDeleteError } from "@/lib/mail/delete-sync";

type RouteContext = { params: Promise<{ id: string; noteId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const { id, noteId } = await context.params;
  const auth = await requireApiSession(request, `/api/conversations/${id}/notes/${noteId}`);
  if ("response" in auth) {
    return auth.response;
  }
  if (auth.session.role === "chief") {
    return NextResponse.json({ error: "Главный не удаляет переписку" }, { status: 403 });
  }

  try {
    await deleteNoteForManager(prisma, id, noteId, auth.session.id);
    return NextResponse.json({ ok: true as const });
  } catch (error) {
    if (error instanceof MailDeleteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Не удалось удалить карточку" }, { status: 502 });
  }
}
