import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { processNextJob } from "@/lib/ai/jobs";
import { imapPollMs, loadMailboxAccounts } from "@/lib/mail/accounts";
import { closeMailbox, pollMailbox, safeError } from "@/lib/mail/imap";
import { rehomeMessagesByThread } from "@/lib/mail/rehome-threads";

config();

const prisma = new PrismaClient();
const JOB_POLL_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function processJobsLoop(): Promise<void> {
  while (true) {
    try {
      const claimed = await processNextJob(prisma);
      if (!claimed) {
        await sleep(JOB_POLL_MS);
      }
    } catch (error) {
      console.error(`[jobs] ${safeError(error)}`);
      await sleep(JOB_POLL_MS);
    }
  }
}

async function pollMailboxLoop(): Promise<void> {
  const { ready, skipped } = loadMailboxAccounts();
  if (skipped.length > 0) {
    console.info(`[worker] skip mailboxes without app password: ${skipped.join(", ")}`);
  }
  if (ready.length === 0) {
    console.info("[worker] no mailboxes to poll; jobs loop keeps running");
    return;
  }

  const users = await prisma.user.findMany({
    where: { email: { in: ready.map((box) => box.email) } },
    select: { id: true, email: true, code: true },
  });

  const byEmail = new Map(users.map((user) => [user.email?.toLowerCase() ?? "", user]));
  const interval = imapPollMs();

  await Promise.all(
    ready.map(async (account) => {
      const user = byEmail.get(account.email);
      if (!user) {
        console.error(`[worker] no user row for ${account.code}`);
        return;
      }

      let connected: Awaited<ReturnType<typeof pollMailbox>> | null = null;
      while (true) {
        try {
          connected = await pollMailbox(prisma, account, user.id, connected);
        } catch (error) {
          console.error(`[imap:${account.code}] ${safeError(error)}`);
          await closeMailbox(connected?.client ?? null);
          connected = null;
        }
        await sleep(interval);
      }
    }),
  );
}

async function main(): Promise<void> {
  console.info("[worker] started");
  const moved = await rehomeMessagesByThread(prisma);
  if (moved > 0) {
    console.info(`[worker] split ${moved} messages into subject threads`);
  }
  await Promise.all([processJobsLoop(), pollMailboxLoop()]);
}

main().catch(async (error) => {
  console.error(`[worker] ${safeError(error)}`);
  await prisma.$disconnect();
  process.exit(1);
});
