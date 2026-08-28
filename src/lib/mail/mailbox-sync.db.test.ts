import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedUsers } from "../seed-users";
import { ingestInbound } from "./ingest";
import { reconcileInboxAgainstUids, reconcileSentAgainstIds } from "./mailbox-sync";
import { normalizeMessageId } from "./message-id";
import { parseMailFields } from "./parse";

const databaseUrl = process.env.DATABASE_URL;
const prisma = databaseUrl ? new PrismaClient() : null;
const EMAIL_PREFIX = "recon-test-";

describe.skipIf(!prisma)("mailbox reconcile against Postgres", () => {
  let annaId = "";
  const managerEmail = "communicationassistant36@gmail.com";

  beforeAll(async () => {
    if (!prisma) {
      return;
    }
    await seedUsers(prisma);
    const anna = await prisma.user.findUnique({ where: { code: "M36" } });
    annaId = anna?.id ?? "";
  });

  beforeEach(async () => {
    if (!prisma) {
      return;
    }
    await prisma.client.deleteMany({
      where: { email: { startsWith: EMAIL_PREFIX } },
    });
  });

  afterAll(async () => {
    await prisma?.client.deleteMany({
      where: { email: { startsWith: EMAIL_PREFIX } },
    });
    await prisma?.$disconnect();
  });

  async function otherInboxUids(exceptMessageId: string): Promise<Set<string>> {
    const rows = await prisma!.message.findMany({
      where: {
        id: { not: exceptMessageId },
        direction: "inbound",
        gmailUid: { not: null },
        deletedAt: null,
        conversation: { managerId: annaId },
      },
      select: { gmailUid: true },
    });
    return new Set(rows.flatMap((row) => (row.gmailUid ? [row.gmailUid] : [])));
  }

  async function otherSentIds(exceptMessageId: string): Promise<Set<string>> {
    const rows = await prisma!.message.findMany({
      where: {
        id: { not: exceptMessageId },
        direction: "outbound",
        smtpMessageId: { not: null },
        deletedAt: null,
        conversation: { managerId: annaId },
      },
      select: { smtpMessageId: true },
    });
    return new Set(
      rows.flatMap((row) => (row.smtpMessageId ? [normalizeMessageId(row.smtpMessageId)] : [])),
    );
  }

  it("hides an inbox letter missing from INBOX and restores it when the UID returns", async () => {
    const inbound = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail,
      gmailUid: "9101",
      parsed: parseMailFields({
        fromEmail: `${EMAIL_PREFIX}inbox@example.com`,
        fromName: "Клиент",
        subject: "Сверка входящих",
        text: "Нужна командировка",
      }),
    });
    expect(inbound.status).toBe("created");
    if (inbound.status !== "created") {
      return;
    }

    await prisma!.aiNote.create({
      data: {
        conversationId: inbound.conversationId,
        type: "travel_offer",
        title: "Подбор",
        body: "Варианты",
        payload: {},
      },
    });

    const keep = await otherInboxUids(inbound.messageId);
    const hidden = await reconcileInboxAgainstUids(prisma!, annaId, keep);
    expect(hidden.hidden).toBeGreaterThanOrEqual(1);

    const afterHide = await prisma!.message.findUnique({ where: { id: inbound.messageId } });
    const threadHidden = await prisma!.conversation.findUnique({
      where: { id: inbound.conversationId },
    });
    const notesHidden = await prisma!.aiNote.findMany({
      where: { conversationId: inbound.conversationId },
    });
    expect(afterHide?.deletedAt).not.toBeNull();
    expect(threadHidden?.deletedAt).not.toBeNull();
    expect(notesHidden.every((note) => note.deletedAt !== null)).toBe(true);

    const restored = await reconcileInboxAgainstUids(
      prisma!,
      annaId,
      new Set([...keep, "9101"]),
    );
    expect(restored.restored).toBeGreaterThanOrEqual(1);

    const afterRestore = await prisma!.message.findUnique({ where: { id: inbound.messageId } });
    const threadLive = await prisma!.conversation.findUnique({
      where: { id: inbound.conversationId },
    });
    const notesStillHidden = await prisma!.aiNote.findMany({
      where: { conversationId: inbound.conversationId },
    });
    expect(afterRestore?.deletedAt).toBeNull();
    expect(threadLive?.deletedAt).toBeNull();
    expect(notesStillHidden.every((note) => note.deletedAt !== null)).toBe(true);
  });

  it("hides outbound mail missing from Sent by Message-ID", async () => {
    const inbound = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail,
      gmailUid: "9102",
      parsed: parseMailFields({
        fromEmail: `${EMAIL_PREFIX}sent@example.com`,
        fromName: "Клиент",
        subject: "Сверка исходящих",
        text: "Нужна командировка",
      }),
    });
    expect(inbound.status).toBe("created");
    if (inbound.status !== "created") {
      return;
    }
    const outbound = await prisma!.message.create({
      data: {
        conversationId: inbound.conversationId,
        direction: "outbound",
        fromEmail: managerEmail,
        toEmail: `${EMAIL_PREFIX}sent@example.com`,
        subject: "Re: Сверка исходящих",
        bodyText: "Приняли заявку",
        sentAt: new Date(),
        smtpMessageId: "<recon-out@mail.example>",
      },
    });

    const keep = await otherSentIds(outbound.id);
    const hidden = await reconcileSentAgainstIds(prisma!, annaId, keep);
    expect(hidden.hidden).toBeGreaterThanOrEqual(1);
    const gone = await prisma!.message.findUnique({ where: { id: outbound.id } });
    expect(gone?.deletedAt).not.toBeNull();

    const inboundStillLive = await prisma!.message.findUnique({
      where: { id: inbound.messageId },
    });
    expect(inboundStillLive?.deletedAt).toBeNull();

    const restored = await reconcileSentAgainstIds(
      prisma!,
      annaId,
      new Set([...keep, "recon-out@mail.example"]),
    );
    expect(restored.restored).toBeGreaterThanOrEqual(1);
    const live = await prisma!.message.findUnique({ where: { id: outbound.id } });
    expect(live?.deletedAt).toBeNull();
  });
});
