import type { PrismaClient } from "@prisma/client";
import { hideMessages, restoreMessages, syncConversations } from "./hide";
import { normalizeMessageId } from "./message-id";
import {
  affectedConversationIds,
  inboundHideIds,
  inboundRestoreIds,
  outboundHideIds,
  outboundRestoreIds,
} from "./reconcile";
import {
  listInboxUids,
  listSentMessageIds,
  resolveFolders,
  type TrashImapClient,
} from "./trash";

export async function reconcileInboxAgainstUids(
  prisma: PrismaClient,
  managerId: string,
  inboxUids: Set<string>,
  at = new Date(),
): Promise<{ hidden: number; restored: number }> {
  const rows = await prisma.message.findMany({
    where: {
      direction: "inbound",
      gmailUid: { not: null },
      conversation: { managerId },
    },
    select: { id: true, conversationId: true, gmailUid: true, deletedAt: true },
  });
  const hideIds = inboundHideIds(rows, inboxUids);
  const restoreIds = inboundRestoreIds(rows, inboxUids);
  await hideMessages(prisma, hideIds, at);
  await restoreMessages(prisma, restoreIds);
  await syncConversations(
    prisma,
    affectedConversationIds(rows, new Set([...hideIds, ...restoreIds])),
    at,
  );
  return { hidden: hideIds.length, restored: restoreIds.length };
}

export async function reconcileSentAgainstIds(
  prisma: PrismaClient,
  managerId: string,
  sentMessageIds: Set<string>,
  at = new Date(),
): Promise<{ hidden: number; restored: number }> {
  const rows = await prisma.message.findMany({
    where: {
      direction: "outbound",
      smtpMessageId: { not: null },
      conversation: { managerId },
    },
    select: { id: true, conversationId: true, smtpMessageId: true, deletedAt: true },
  });
  const hideIds = outboundHideIds(rows, sentMessageIds, normalizeMessageId);
  const restoreIds = outboundRestoreIds(rows, sentMessageIds, normalizeMessageId);
  await hideMessages(prisma, hideIds, at);
  await restoreMessages(prisma, restoreIds);
  await syncConversations(
    prisma,
    affectedConversationIds(rows, new Set([...hideIds, ...restoreIds])),
    at,
  );
  return { hidden: hideIds.length, restored: restoreIds.length };
}

export async function reconcileMailbox(
  prisma: PrismaClient,
  managerId: string,
  client: TrashImapClient,
): Promise<void> {
  const inboxUids = await listInboxUids(client);
  await reconcileInboxAgainstUids(prisma, managerId, inboxUids);

  const folders = resolveFolders(await client.list());
  await client.mailboxOpen(folders.sent);
  const sentIds = await listSentMessageIds(client);
  await reconcileSentAgainstIds(prisma, managerId, sentIds);
}
