import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth-http";
import { prisma } from "@/lib/db";
import { deleteOutboundMessageForManager, MailDeleteError } from "@/lib/mail/delete-sync";

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const { id, messageId } = await context.params;
  const auth = await requireApiSession(
    request,
    `/api/conversations/${id}/messages/${messageId}`,
  );
  if ("response" in auth) {
    return auth.response;
  }
  if (auth.session.role === "chief") {
    return NextResponse.json({ error: "Главный не удаляет переписку" }, { status: 403 });
  }

  try {
    await deleteOutboundMessageForManager(prisma, id, messageId, auth.session.id);
    return NextResponse.json({ ok: true as const });
  } catch (error) {
    if (error instanceof MailDeleteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Не удалось удалить письмо" }, { status: 502 });
  }
}
