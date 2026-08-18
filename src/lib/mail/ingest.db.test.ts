import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedUsers } from "../seed-users";
import { ingestInbound } from "./ingest";
import { parseEml, parseMailFields } from "./parse";
import { rehomeMessagesByThread } from "./rehome-threads";

const databaseUrl = process.env.DATABASE_URL;
const prisma = databaseUrl ? new PrismaClient() : null;
const fixtures = path.join(process.cwd(), "tests/fixtures/mail");

describe.skipIf(!prisma)("ingest inbound mail", () => {
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
      where: { email: { startsWith: "imap-test-" } },
    });
  });

  afterAll(async () => {
    await prisma?.client.deleteMany({
      where: { email: { startsWith: "imap-test-" } },
    });
    await prisma?.$disconnect();
  });

  it("creates client, conversation and inbound message from a parsed letter", async () => {
    const parsed = await parseEml(readFileSync(path.join(fixtures, "inbound-plain.eml")));
    const first = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail,
      gmailUid: "1001",
      parsed,
    });
    expect(first.status).toBe("created");
    if (first.status !== "created") {
      return;
    }

    const message = await prisma!.message.findUnique({ where: { id: first.messageId } });
    expect(message).toMatchObject({
      direction: "inbound",
      fromEmail: "imap-test-client@example.com",
      toEmail: "communicationassistant36@gmail.com",
      gmailUid: "1001",
    });
    expect(message?.bodyText).toContain("командировку");

    const client = await prisma!.client.findUnique({ where: { id: first.clientId } });
    expect(client?.displayName).toBe("Иван Клиент");
  });

  it("does not duplicate a message with the same uid", async () => {
    const parsed = await parseEml(readFileSync(path.join(fixtures, "inbound-plain.eml")));
    const input = {
      managerId: annaId,
      managerEmail,
      gmailUid: "1002",
      parsed,
    };
    const first = await ingestInbound(prisma!, input);
    const second = await ingestInbound(prisma!, input);
    expect(first.status).toBe("created");
    expect(second.status).toBe("duplicate");

    const count = await prisma!.message.count({
      where: { toEmail: managerEmail, gmailUid: "1002" },
    });
    expect(count).toBe(1);
  });

  it("skips mail from the manager mailbox", async () => {
    const parsed = await parseEml(readFileSync(path.join(fixtures, "from-self.eml")));
    const result = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail,
      gmailUid: "1003",
      parsed,
    });
    expect(result).toEqual({ status: "skipped", reason: "self" });
    expect(await prisma!.message.count({ where: { gmailUid: "1003" } })).toBe(0);
  });

  it("skips mail marked X-CommAssist: 1", async () => {
    const parsed = await parseEml(readFileSync(path.join(fixtures, "commassist-header.eml")));
    const result = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail,
      gmailUid: "1004",
      parsed,
    });
    expect(result).toEqual({ status: "skipped", reason: "header" });
    expect(await prisma!.client.count({ where: { email: "imap-test-header@example.com" } })).toBe(0);
  });

  it("skips Google account notifications without creating a client", async () => {
    const parsed = parseMailFields({
      fromEmail: "no-reply@accounts.google.com",
      fromName: "Google",
      subject: "Оповещение системы безопасности",
      text: "Новый вход в аккаунт",
    });
    const result = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail,
      gmailUid: "google-system-1",
      parsed,
    });
    expect(result).toEqual({ status: "skipped", reason: "system" });
    expect(await prisma!.client.count({
      where: { email: "no-reply@accounts.google.com", managerId: annaId },
    })).toBe(0);
  });

  it("opens a new conversation when the same person writes with another subject", async () => {
    const parsed = await parseEml(readFileSync(path.join(fixtures, "inbound-plain.eml")));
    const first = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail,
      gmailUid: "1010",
      parsed,
    });
    const second = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail,
      gmailUid: "1011",
      parsed: parseMailFields({
        fromEmail: parsed.fromEmail,
        fromName: parsed.fromName,
        toEmail: parsed.toEmail,
        subject: "Командировка Томск",
        text: "Нужна командировка в Томск",
        date: new Date("2026-08-18T01:00:00.000Z"),
      }),
    });
    const reply = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail,
      gmailUid: "1012",
      parsed: parseMailFields({
        fromEmail: parsed.fromEmail,
        fromName: parsed.fromName,
        toEmail: parsed.toEmail,
        subject: "Re: Тест IMAP",
        text: "уточнение по первой заявке",
        date: new Date("2026-08-18T01:05:00.000Z"),
      }),
    });

    expect(first.status).toBe("created");
    expect(second.status).toBe("created");
    expect(reply.status).toBe("created");
    if (first.status !== "created" || second.status !== "created" || reply.status !== "created") {
      return;
    }
    expect(second.conversationId).not.toBe(first.conversationId);
    expect(reply.conversationId).toBe(first.conversationId);
    expect(second.clientId).toBe(first.clientId);
    expect(
      await prisma!.conversation.count({ where: { clientId: first.clientId } }),
    ).toBe(2);
  });

  it("splits mixed subjects that landed in one conversation", async () => {
    const parsed = await parseEml(readFileSync(path.join(fixtures, "inbound-plain.eml")));
    const first = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail,
      gmailUid: "1020",
      parsed,
    });
    expect(first.status).toBe("created");
    if (first.status !== "created") {
      return;
    }
    await prisma!.message.create({
      data: {
        conversationId: first.conversationId,
        direction: "inbound",
        fromEmail: parsed.fromEmail,
        toEmail: managerEmail,
        subject: "Командировка Томск",
        bodyText: "Нужна командировка в Томск",
        sentAt: new Date("2026-08-18T01:10:00.000Z"),
        gmailUid: "1021",
      },
    });
    expect(await rehomeMessagesByThread(prisma!, first.conversationId)).toBeGreaterThanOrEqual(1);
    expect(
      await prisma!.conversation.count({ where: { clientId: first.clientId } }),
    ).toBe(2);
    const tomsk = await prisma!.message.findFirst({
      where: { gmailUid: "1021" },
      select: { conversationId: true },
    });
    expect(tomsk?.conversationId).not.toBe(first.conversationId);
  });
});
