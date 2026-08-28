import { ImapFlow } from "imapflow";
import type { PrismaClient } from "@prisma/client";
import { ingestInbound, ingestLogLine } from "./ingest";
import { parseEml } from "./parse";
import { imapSettings, type MailboxAccount } from "./accounts";
import { initialLastUid, newMailUidRange } from "./cursor";
import { reconcileInboxAgainstUids, reconcileSentAgainstIds } from "./mailbox-sync";
import { listInboxUids, listSentMessageIds, resolveFolders } from "./trash";

type ConnectedBox = {
  account: MailboxAccount;
  client: ImapFlow;
};

function safeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/password[=:]\s*\S+/gi, "password=***");
  }
  return "unknown error";
}

export async function connectMailbox(account: MailboxAccount): Promise<ImapFlow> {
  const { host, port } = imapSettings();
  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user: account.email, pass: account.password },
    logger: false,
    disableAutoIdle: true,
  });
  await client.connect();
  return client;
}

export async function closeMailbox(client: ImapFlow | null): Promise<void> {
  if (!client) {
    return;
  }
  try {
    await client.logout();
  } catch {
    try {
      client.close();
    } catch {
      // already closed
    }
  }
}

async function saveCursor(prisma: PrismaClient, userId: string, lastUid: number): Promise<void> {
  await prisma.mailCursor.upsert({
    where: { userId },
    create: { userId, lastUid },
    update: { lastUid },
  });
}

export async function pollMailbox(
  prisma: PrismaClient,
  account: MailboxAccount,
  userId: string,
  connected: ConnectedBox | null,
): Promise<ConnectedBox> {
  let client = connected?.client ?? null;
  if (!client || client.usable === false) {
    await closeMailbox(client);
    client = await connectMailbox(account);
  }

  // Re-SELECT INBOX each poll. imapflow reuses a selected mailbox without SELECT,
  // and with disableAutoIdle Gmail does not push new UIDs on the stale snapshot.
  if (client.mailbox) {
    try {
      await client.mailboxClose();
    } catch {
      await closeMailbox(client);
      client = await connectMailbox(account);
    }
  }

  const lock = await client.getMailboxLock("INBOX");
  try {
    const existing = await prisma.mailCursor.findUnique({ where: { userId } });
    const mailbox = client.mailbox || undefined;
    const lastUid = initialLastUid(existing?.lastUid, mailbox?.uidNext ?? 1);
    if (!existing) {
      console.info(`[imap:${account.code}] first start, catch-up after uid=${lastUid}`);
    }

    let maxSeen = lastUid;
    const uidNext = mailbox?.uidNext ?? lastUid + 1;
    if (uidNext > lastUid + 1) {
      const range = newMailUidRange(lastUid);
      for await (const message of client.fetch(range, { uid: true, source: true }, { uid: true })) {
        const uid = Number(message.uid);
        if (!Number.isFinite(uid) || uid <= lastUid) {
          continue;
        }
        maxSeen = Math.max(maxSeen, uid);
        if (!message.source) {
          continue;
        }

        try {
          const parsed = await parseEml(message.source);
          const input = {
            managerId: userId,
            managerEmail: account.email,
            gmailUid: String(uid),
            parsed,
          };
          const result = await ingestInbound(prisma, input);
          console.info(`[imap:${account.code}] ${ingestLogLine(input, result)}`);
        } catch (error) {
          console.error(`[imap:${account.code}] failed uid=${uid}: ${safeError(error)}`);
        }
      }
    }

    if (maxSeen > lastUid) {
      await saveCursor(prisma, userId, maxSeen);
    }

    try {
      const inboxUids = await listInboxUids(client);
      const inbound = await reconcileInboxAgainstUids(prisma, userId, inboxUids);
      if (inbound.hidden > 0 || inbound.restored > 0) {
        console.info(
          `[imap:${account.code}] inbox reconcile hidden=${inbound.hidden} restored=${inbound.restored}`,
        );
      }
    } catch (error) {
      console.error(`[imap:${account.code}] inbox reconcile ${safeError(error)}`);
    }
  } finally {
    lock.release();
  }

  try {
    const folders = resolveFolders(await client.list());
    const sentLock = await client.getMailboxLock(folders.sent);
    try {
      const sentIds = await listSentMessageIds(client);
      const outbound = await reconcileSentAgainstIds(prisma, userId, sentIds);
      if (outbound.hidden > 0 || outbound.restored > 0) {
        console.info(
          `[imap:${account.code}] sent reconcile hidden=${outbound.hidden} restored=${outbound.restored}`,
        );
      }
    } finally {
      sentLock.release();
    }
  } catch (error) {
    console.error(`[imap:${account.code}] sent reconcile ${safeError(error)}`);
  }

  return { account, client };
}

export { safeError };
