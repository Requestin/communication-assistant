import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth-http";
import { prisma } from "@/lib/db";
import { deleteConversationForManager, MailDeleteError } from "@/lib/mail/delete-sync";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const auth = await requireApiSession(request, `/api/conversations/${id}`);
  if ("response" in auth) {
    return auth.response;
  }
  if (auth.session.role === "chief") {
    return NextResponse.json({ error: "Главный не удаляет переписку" }, { status: 403 });
  }

  try {
    await deleteConversationForManager(prisma, id, auth.session.id);
    return NextResponse.json({ ok: true as const });
  } catch (error) {
    if (error instanceof MailDeleteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Не удалось удалить диалог" }, { status: 502 });
  }
}
