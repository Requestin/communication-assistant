import type { Message, PrismaClient } from "@prisma/client";

export type InboxConversationDto = {
  id: string;
  clientName: string;
  clientEmail: string;
  subject: string;
  lastMessageAt: string;
  preview: string;
};

export type InboxMessageDto = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  fromEmail: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  sentAt: string;
  createdAt: string;
};

export type InboxSnapshotDto = {
  conversations: InboxConversationDto[];
  messages: InboxMessageDto[];
  notes: [];
};

const PREVIEW_LEN = 160;

export function previewText(body: string): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  if (oneLine.length <= PREVIEW_LEN) {
    return oneLine;
  }
  return `${oneLine.slice(0, PREVIEW_LEN)}…`;
}

export function toMessageDto(message: Message): InboxMessageDto {
  return {
    id: message.id,
    conversationId: message.conversationId,
    direction: message.direction,
    fromEmail: message.fromEmail,
    toEmail: message.toEmail,
    subject: message.subject,
    bodyText: message.bodyText,
    sentAt: message.sentAt.toISOString(),
    createdAt: message.createdAt.toISOString(),
  };
}

export async function buildInboxSnapshot(
  prisma: PrismaClient,
  options: {
    managerId?: string;
    conversationId?: string;
    since?: Date;
  },
): Promise<InboxSnapshotDto> {
  const conversations = await prisma.conversation.findMany({
    where: options.managerId ? { managerId: options.managerId } : undefined,
    orderBy: { lastMessageAt: "desc" },
    include: {
      client: { select: { displayName: true, email: true } },
      messages: { orderBy: { sentAt: "desc" }, take: 1 },
    },
  });

  const conversationDtos: InboxConversationDto[] = conversations.map((item) => ({
    id: item.id,
    clientName: item.client.displayName,
    clientEmail: item.client.email,
    subject: item.subject,
    lastMessageAt: item.lastMessageAt.toISOString(),
    preview: previewText(item.messages[0]?.bodyText ?? ""),
  }));

  if (!options.conversationId) {
    return { conversations: conversationDtos, messages: [], notes: [] };
  }

  const owned = conversations.some((item) => item.id === options.conversationId);
  if (!owned) {
    return { conversations: conversationDtos, messages: [], notes: [] };
  }

  const messages = await prisma.message.findMany({
    where: {
      conversationId: options.conversationId,
      ...(options.since ? { createdAt: { gt: options.since } } : {}),
    },
    orderBy: { sentAt: "asc" },
  });

  return {
    conversations: conversationDtos,
    messages: messages.map(toMessageDto),
    notes: [],
  };
}
