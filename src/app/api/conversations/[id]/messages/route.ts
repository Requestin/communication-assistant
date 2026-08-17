import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth-http";
import { prisma } from "@/lib/db";
import { toMessageDto } from "@/lib/inbox";
import { replySubject, sendManagerReply, SmtpSendError } from "@/lib/mail/smtp";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const auth = await requireApiSession(request, `/api/conversations/${id}/messages`);
  if ("response" in auth) {
    return auth.response;
  }

  if (auth.session.role === "chief") {
    return NextResponse.json({ error: "Главный не отвечает клиентам" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as { bodyText?: unknown } | null;
  const bodyText = typeof payload?.bodyText === "string" ? payload.bodyText.trim() : "";
  if (!bodyText) {
    return NextResponse.json({ error: "Введите текст ответа" }, { status: 400 });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      client: { select: { email: true } },
      manager: { select: { id: true, email: true } },
      messages: {
        where: { direction: "inbound", gmailMessageId: { not: null } },
        orderBy: { sentAt: "desc" },
        take: 1,
        select: { gmailMessageId: true },
      },
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Лента не найдена" }, { status: 404 });
  }
  if (conversation.managerId !== auth.session.id) {
    return NextResponse.json({ error: "Нельзя писать в чужую ленту" }, { status: 403 });
  }
  if (!conversation.manager.email) {
    return NextResponse.json({ error: "У менеджера нет почты" }, { status: 400 });
  }

  const subject = replySubject(conversation.subject);
  const inReplyTo = conversation.messages[0]?.gmailMessageId ?? null;

  let smtpMessageId: string | null = null;
  try {
    const sent = await sendManagerReply({
      fromEmail: conversation.manager.email,
      toEmail: conversation.client.email,
      subject,
      bodyText,
      inReplyTo,
    });
    smtpMessageId = sent.smtpMessageId;
  } catch (error) {
    if (error instanceof SmtpSendError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Не удалось отправить письмо" }, { status: 502 });
  }

  const sentAt = new Date();
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "outbound",
      fromEmail: conversation.manager.email,
      toEmail: conversation.client.email,
      subject,
      bodyText,
      sentAt,
      smtpMessageId,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { subject, lastMessageAt: sentAt },
  });

  // TODO(stage 05): создать Job evaluate_quality после исходящего.

  return NextResponse.json({ message: toMessageDto(message) });
}
