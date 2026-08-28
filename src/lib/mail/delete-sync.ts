import type { PrismaClient } from "@prisma/client";
import { findMailboxAccount } from "./accounts";
import { hideConversation, hideMessages, hideNotes, syncConversationVisibility } from "./hide";
import { MailTrashError, trashMailboxMessages } from "./trash";

type TrashFn = typeof trashMailboxMessages;

let trashOverride: TrashFn | null = null;

export function setTrashMailboxForTests(fn: TrashFn | null): void {
  trashOverride = fn;
}

async function moveToTrash(
  ...args: Parameters<TrashFn>
): ReturnType<TrashFn> {
  return (trashOverride ?? trashMailboxMessages)(...args);
}

export class MailDeleteError extends Error {
  readonly status: 400 | 403 | 404 | 502;

  constructor(message: string, status: 400 | 403 | 404 | 502) {
    super(message);
    this.name = "MailDeleteError";
    this.status = status;
  }
}

async function requireAccount(fromEmail: string) {
  if (trashOverride) {
    return { code: "M36" as const, email: fromEmail.toLowerCase(), password: "test" };
  }
  const account = findMailboxAccount(fromEmail);
  if (!account) {
    throw new MailDeleteError("Нет пароля приложения для этого ящика", 400);
  }
  return account;
}

export async function deleteConversationForManager(
  prisma: PrismaClient,
  conversationId: string,
  managerId: string,
): Promise<void> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, deletedAt: null },
    include: {
      manager: { select: { email: true } },
      messages: {
        where: { deletedAt: null },
        select: { gmailUid: true, smtpMessageId: true, direction: true },
      },
    },
  });
  if (!conversation) {
    throw new MailDeleteError("Лента не найдена", 404);
  }
  if (conversation.managerId !== managerId) {
    throw new MailDeleteError("Нельзя менять чужую ленту", 403);
  }
  if (!conversation.manager.email) {
    throw new MailDeleteError("У менеджера нет почты", 400);
  }

  const account = await requireAccount(conversation.manager.email);
  const inboxUids = conversation.messages
    .filter((row) => row.direction === "inbound" && row.gmailUid)
    .map((row) => row.gmailUid as string);
  const smtpMessageIds = conversation.messages
    .filter((row) => row.direction === "outbound" && row.smtpMessageId)
    .map((row) => row.smtpMessageId as string);

  try {
    await moveToTrash(account, { inboxUids, smtpMessageIds });
  } catch (error) {
    if (error instanceof MailTrashError) {
      throw new MailDeleteError("Не удалось удалить в почте", 502);
    }
    throw error;
  }

  await hideConversation(prisma, conversationId);
}

export async function deleteOutboundMessageForManager(
  prisma: PrismaClient,
  conversationId: string,
  messageId: string,
  managerId: string,
): Promise<void> {
  const message = await prisma.message.findFirst({
    where: { id: messageId, conversationId, deletedAt: null },
    include: {
      conversation: {
        select: { managerId: true, manager: { select: { email: true } } },
      },
    },
  });
  if (!message) {
    throw new MailDeleteError("Письмо не найдено", 404);
  }
  if (message.conversation.managerId !== managerId) {
    throw new MailDeleteError("Нельзя менять чужую ленту", 403);
  }
  if (message.direction !== "outbound") {
    throw new MailDeleteError("Письмо клиента удалить нельзя", 403);
  }
  if (!message.conversation.manager.email) {
    throw new MailDeleteError("У менеджера нет почты", 400);
  }

  const account = await requireAccount(message.conversation.manager.email);
  try {
    await moveToTrash(account, {
      inboxUids: [],
      smtpMessageIds: message.smtpMessageId ? [message.smtpMessageId] : [],
    });
  } catch (error) {
    if (error instanceof MailTrashError) {
      throw new MailDeleteError("Не удалось удалить в почте", 502);
    }
    throw error;
  }

  await hideMessages(prisma, [messageId]);
  await syncConversationVisibility(prisma, conversationId);
}

export async function deleteNoteForManager(
  prisma: PrismaClient,
  conversationId: string,
  noteId: string,
  managerId: string,
): Promise<void> {
  const note = await prisma.aiNote.findFirst({
    where: { id: noteId, conversationId, deletedAt: null },
    include: { conversation: { select: { managerId: true } } },
  });
  if (!note) {
    throw new MailDeleteError("Карточка не найдена", 404);
  }
  if (note.conversation.managerId !== managerId) {
    throw new MailDeleteError("Нельзя менять чужую ленту", 403);
  }
  await hideNotes(prisma, [noteId]);
}
