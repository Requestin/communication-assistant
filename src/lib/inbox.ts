import type { AiNote, Message, PrismaClient } from "@prisma/client";

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

export type InboxNoteDto = {
  id: string;
  conversationId: string;
  messageId: string | null;
  type: "quality_hint" | "travel_offer";
  title: string;
  body: string;
  createdAt: string;
  literacy: number | null;
  spelling: number | null;
  punctuation: number | null;
  businessStyle: number | null;
  overall: number | null;
  issues: string[];
};

export type InboxSnapshotDto = {
  conversations: InboxConversationDto[];
  messages: InboxMessageDto[];
  notes: InboxNoteDto[];
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

function asScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asIssues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export function toNoteDto(note: AiNote): InboxNoteDto {
  const payload =
    note.payload && typeof note.payload === "object" && !Array.isArray(note.payload)
      ? (note.payload as Record<string, unknown>)
      : {};
  return {
    id: note.id,
    conversationId: note.conversationId,
    messageId: note.messageId,
    type: note.type,
    title: note.title,
    body: note.body,
    createdAt: note.createdAt.toISOString(),
    literacy: asScore(payload.literacy),
    spelling: asScore(payload.spelling),
    punctuation: asScore(payload.punctuation),
    businessStyle: asScore(payload.businessStyle),
    overall: asScore(payload.overall),
    issues: asIssues(payload.issues),
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

  const [messages, notes] = await Promise.all([
    prisma.message.findMany({
      where: {
        conversationId: options.conversationId,
        ...(options.since ? { createdAt: { gt: options.since } } : {}),
      },
      orderBy: { sentAt: "asc" },
    }),
    prisma.aiNote.findMany({
      where: {
        conversationId: options.conversationId,
        ...(options.since ? { createdAt: { gt: options.since } } : {}),
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    conversations: conversationDtos,
    messages: messages.map(toMessageDto),
    notes: notes.map(toNoteDto),
  };
}
