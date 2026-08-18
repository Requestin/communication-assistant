import type { PrismaClient } from "@prisma/client";
import { conversationThreadKey } from "./thread-key";

export async function rehomeMessagesByThread(
  prisma: PrismaClient,
  conversationId?: string,
): Promise<number> {
  const conversations = await prisma.conversation.findMany({
    where: conversationId ? { id: conversationId } : undefined,
    include: {
      messages: { orderBy: { sentAt: "asc" }, select: { id: true, subject: true, sentAt: true } },
    },
  });

  let moved = 0;
  for (const conversation of conversations) {
    if (conversation.messages.length === 0) {
      continue;
    }
    const homeKey =
      conversation.threadKey && conversation.threadKey !== "(без темы)"
        ? conversation.threadKey
        : conversationThreadKey(conversation.messages[0]!.subject);
    if (conversation.threadKey !== homeKey) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { threadKey: homeKey },
      });
    }

    const groups = new Map<string, typeof conversation.messages>();
    for (const message of conversation.messages) {
      const key = conversationThreadKey(message.subject);
      const bucket = groups.get(key) ?? [];
      bucket.push(message);
      groups.set(key, bucket);
    }

    for (const [key, rows] of groups) {
      if (key === homeKey) {
        continue;
      }
      const last = rows[rows.length - 1]!;
      let target = await prisma.conversation.findUnique({
        where: {
          managerId_clientId_threadKey: {
            managerId: conversation.managerId,
            clientId: conversation.clientId,
            threadKey: key,
          },
        },
      });
      if (!target) {
        target = await prisma.conversation.create({
          data: {
            managerId: conversation.managerId,
            clientId: conversation.clientId,
            subject: last.subject,
            threadKey: key,
            lastMessageAt: last.sentAt,
          },
        });
      }
      const ids = rows.map((row) => row.id);
      await prisma.message.updateMany({
        where: { id: { in: ids } },
        data: { conversationId: target.id },
      });
      await prisma.aiNote.updateMany({
        where: { messageId: { in: ids } },
        data: { conversationId: target.id },
      });
      await prisma.job.updateMany({
        where: { messageId: { in: ids } },
        data: { conversationId: target.id },
      });
      const latest = await prisma.message.findFirst({
        where: { conversationId: target.id },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true, subject: true },
      });
      if (latest) {
        await prisma.conversation.update({
          where: { id: target.id },
          data: { lastMessageAt: latest.sentAt, subject: latest.subject },
        });
      }
      moved += ids.length;
    }

    const leftover = await prisma.message.findFirst({
      where: { conversationId: conversation.id },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true, subject: true },
    });
    if (leftover) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: leftover.sentAt, subject: leftover.subject },
      });
    }
  }

  return moved;
}
