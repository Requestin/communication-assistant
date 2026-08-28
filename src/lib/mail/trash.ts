import { ImapFlow } from "imapflow";
import type { MailboxAccount } from "./accounts";
import { closeMailbox, connectMailbox, safeError } from "./imap";
import { messageIdVariants, normalizeMessageId } from "./message-id";

const SENT_FALLBACKS = ["[Gmail]/Sent Mail", "[Gmail]/Sent", "[Gmail]/Отправленные"];
const TRASH_FALLBACKS = ["[Gmail]/Trash", "[Gmail]/Bin", "[Gmail]/Корзина"];

export class MailTrashError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailTrashError";
  }
}

export type ListedMailbox = {
  path: string;
  specialUse?: string | false;
};

export type MailboxFolders = {
  sent: string;
  trash: string;
};

export type TrashImapClient = {
  list(): Promise<ListedMailbox[]>;
  mailboxOpen(path: string): Promise<unknown>;
  search(
    query: object,
    options?: { uid?: boolean },
  ): Promise<Array<number | string> | false | null | undefined>;
  messageMove(
    range: string | number[],
    destination: string,
    options?: { uid?: boolean },
  ): Promise<unknown>;
  fetch(
    range: string,
    query: object,
    options?: { uid?: boolean },
  ): AsyncIterable<{ uid?: number; envelope?: { messageId?: string | null } }>;
};

export function pickSpecialMailbox(
  boxes: ListedMailbox[],
  use: "\\Sent" | "\\Trash",
  fallbacks: string[],
): string {
  const needle = use.toLowerCase();
  const special = boxes.find((box) => String(box.specialUse ?? "").toLowerCase() === needle);
  if (special?.path) {
    return special.path;
  }
  const paths = new Set(boxes.map((box) => box.path));
  const named = fallbacks.find((path) => paths.has(path));
  if (named) {
    return named;
  }
  if (fallbacks[0]) {
    return fallbacks[0];
  }
  throw new MailTrashError("Не найдена папка почты");
}

export function resolveFolders(boxes: ListedMailbox[]): MailboxFolders {
  return {
    sent: pickSpecialMailbox(boxes, "\\Sent", SENT_FALLBACKS),
    trash: pickSpecialMailbox(boxes, "\\Trash", TRASH_FALLBACKS),
  };
}

function asUidList(
  value: Array<number | string> | false | null | undefined,
): Array<number | string> {
  return Array.isArray(value) ? value : [];
}

async function moveUids(client: TrashImapClient, uids: number[], trashPath: string): Promise<void> {
  const unique = Array.from(new Set(uids.filter((uid) => Number.isFinite(uid) && uid > 0)));
  if (unique.length === 0) {
    return;
  }
  try {
    await client.messageMove(unique, trashPath, { uid: true });
  } catch (error) {
    throw new MailTrashError(safeError(error));
  }
}

export async function searchSentUidsByMessageId(
  client: TrashImapClient,
  rawId: string,
): Promise<number[]> {
  const found = new Set<number>();
  for (const variant of messageIdVariants(rawId)) {
    try {
      const uids = asUidList(
        await client.search({ header: ["Message-ID", variant] }, { uid: true }),
      );
      for (const uid of uids) {
        const numeric = Number(uid);
        if (Number.isFinite(numeric)) {
          found.add(numeric);
        }
      }
    } catch {
      // Gmail sometimes rejects a header variant; try the next one.
    }
  }
  return Array.from(found);
}

export async function listInboxUids(client: TrashImapClient): Promise<Set<string>> {
  const uids = asUidList(await client.search({ all: true }, { uid: true }));
  const set = new Set<string>();
  for (const uid of uids) {
    if (uid !== undefined && uid !== null && `${uid}`.length > 0) {
      set.add(String(uid));
    }
  }
  return set;
}

export async function listSentMessageIds(client: TrashImapClient): Promise<Set<string>> {
  const ids = new Set<string>();
  try {
    for await (const message of client.fetch("1:*", { envelope: true, uid: true }, { uid: true })) {
      const raw = message.envelope?.messageId;
      if (raw) {
        ids.add(normalizeMessageId(raw));
      }
    }
  } catch {
    return ids;
  }
  return ids;
}

export async function withImapSession<T>(
  account: MailboxAccount,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = await connectMailbox(account);
  try {
    return await fn(client);
  } finally {
    await closeMailbox(client);
  }
}

export async function trashMailboxMessages(
  account: MailboxAccount,
  input: { inboxUids: string[]; smtpMessageIds: string[] },
): Promise<void> {
  try {
    await withImapSession(account, async (client) => {
      const folders = resolveFolders(await client.list());
      if (input.inboxUids.length > 0) {
        await client.mailboxOpen("INBOX");
        await moveUids(
          client,
          input.inboxUids.map((uid) => Number(uid)),
          folders.trash,
        );
      }
      if (input.smtpMessageIds.length > 0) {
        await client.mailboxOpen(folders.sent);
        const sentUids: number[] = [];
        for (const smtpId of input.smtpMessageIds) {
          sentUids.push(...(await searchSentUidsByMessageId(client, smtpId)));
        }
        await moveUids(client, sentUids, folders.trash);
      }
    });
  } catch (error) {
    if (error instanceof MailTrashError) {
      throw error;
    }
    throw new MailTrashError(safeError(error));
  }
}
