import type { PrismaClient } from "@prisma/client";

const live = { deletedAt: null as Date | null };

export async function hideMessages(
  prisma: PrismaClient,
  ids: string[],
  at = new Date(),
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await prisma.message.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data: { deletedAt: at },
  });
  await prisma.aiNote.updateMany({
    where: { messageId: { in: ids }, deletedAt: null },
    data: { deletedAt: at },
  });
}

export async function restoreMessages(prisma: PrismaClient, ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await prisma.message.updateMany({
    where: { id: { in: ids } },
    data: { deletedAt: null },
  });
}

export async function hideNotes(
  prisma: PrismaClient,
  ids: string[],
  at = new Date(),
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await prisma.aiNote.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data: { deletedAt: at },
  });
}

export async function hideConversation(
  prisma: PrismaClient,
  conversationId: string,
  at = new Date(),
): Promise<void> {
  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: conversationId },
      data: { deletedAt: at },
    }),
    prisma.message.updateMany({
      where: { conversationId, deletedAt: null },
      data: { deletedAt: at },
    }),
    prisma.aiNote.updateMany({
      where: { conversationId, deletedAt: null },
      data: { deletedAt: at },
    }),
  ]);
}

export async function syncConversationVisibility(
  prisma: PrismaClient,
  conversationId: string,
  at = new Date(),
): Promise<void> {
  const liveMessage = await prisma.message.findFirst({
    where: { conversationId, ...live },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true, subject: true },
  });
  if (!liveMessage) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { deletedAt: at },
    });
    await prisma.aiNote.updateMany({
      where: { conversationId, deletedAt: null },
      data: { deletedAt: at },
    });
    return;
  }
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      deletedAt: null,
      lastMessageAt: liveMessage.sentAt,
      subject: liveMessage.subject,
    },
  });
}

export async function syncConversations(
  prisma: PrismaClient,
  conversationIds: string[],
  at = new Date(),
): Promise<void> {
  const unique = Array.from(new Set(conversationIds));
  for (const id of unique) {
    await syncConversationVisibility(prisma, id, at);
  }
}
