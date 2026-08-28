export type ReconcilableMessage = {
  id: string;
  conversationId: string;
  deletedAt: Date | null;
};

export type InboundRow = ReconcilableMessage & {
  gmailUid: string | null;
};

export type OutboundRow = ReconcilableMessage & {
  smtpMessageId: string | null;
};

export function inboundHideIds(rows: InboundRow[], inboxUids: Set<string>): string[] {
  return rows
    .filter((row) => row.gmailUid && !row.deletedAt && !inboxUids.has(row.gmailUid))
    .map((row) => row.id);
}

export function inboundRestoreIds(rows: InboundRow[], inboxUids: Set<string>): string[] {
  return rows
    .filter((row) => row.gmailUid && row.deletedAt && inboxUids.has(row.gmailUid))
    .map((row) => row.id);
}

export function outboundHideIds(
  rows: OutboundRow[],
  sentMessageIds: Set<string>,
  normalizeId: (raw: string) => string,
): string[] {
  return rows
    .filter((row) => {
      if (!row.smtpMessageId || row.deletedAt) {
        return false;
      }
      return !sentMessageIds.has(normalizeId(row.smtpMessageId));
    })
    .map((row) => row.id);
}

export function outboundRestoreIds(
  rows: OutboundRow[],
  sentMessageIds: Set<string>,
  normalizeId: (raw: string) => string,
): string[] {
  return rows
    .filter((row) => {
      if (!row.smtpMessageId || !row.deletedAt) {
        return false;
      }
      return sentMessageIds.has(normalizeId(row.smtpMessageId));
    })
    .map((row) => row.id);
}

export function affectedConversationIds(
  rows: ReconcilableMessage[],
  messageIds: Set<string>,
): string[] {
  return Array.from(
    new Set(rows.filter((row) => messageIds.has(row.id)).map((row) => row.conversationId)),
  );
}
