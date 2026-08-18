import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { processNextQualityJob } from "./jobs";
import { resetLlmClientStateForTests, setLlmCompleteForTests } from "./llm";
import { ingestInbound } from "../mail/ingest";
import { parseMailFields } from "../mail/parse";
import { seedUsers } from "../seed-users";

const databaseUrl = process.env.DATABASE_URL;
const prisma = databaseUrl ? new PrismaClient() : null;

describe.skipIf(!prisma)("evaluate_quality jobs", () => {
  let annaId = "";
  const annaEmail = "communicationassistant36@gmail.com";

  beforeAll(async () => {
    if (!prisma) {
      return;
    }
    await seedUsers(prisma);
    const anna = await prisma.user.findUnique({ where: { code: "M36" } });
    annaId = anna?.id ?? "";
  });

  beforeEach(async () => {
    resetLlmClientStateForTests();
    if (!prisma) {
      return;
    }
    await prisma.client.deleteMany({
      where: { email: { startsWith: "quality-test-" } },
    });
  });

  afterEach(() => {
    resetLlmClientStateForTests();
  });

  afterAll(async () => {
    await prisma?.client.deleteMany({
      where: { email: { startsWith: "quality-test-" } },
    });
    await prisma?.$disconnect();
  });

  async function seedOutbound(clientEmail: string, bodyText: string) {
    const inbound = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail: annaEmail,
      gmailUid: `quality-${clientEmail}`,
      parsed: parseMailFields({
        fromEmail: clientEmail,
        fromName: "Клиент",
        subject: "Командировка",
        text: "Нужна командировка в Петербург",
      }),
    });
    if (inbound.status !== "created") {
      throw new Error("failed to seed inbound");
    }
    const outbound = await prisma!.message.create({
      data: {
        conversationId: inbound.conversationId,
        direction: "outbound",
        fromEmail: annaEmail,
        toEmail: clientEmail,
        subject: "Re: Командировка",
        bodyText,
        sentAt: new Date(),
      },
    });
    const job = await prisma!.job.create({
      data: {
        type: "evaluate_quality",
        status: "pending",
        conversationId: inbound.conversationId,
        messageId: outbound.id,
        payload: { messageId: outbound.id },
      },
    });
    return { conversationId: inbound.conversationId, outbound, job, inboundId: inbound.messageId };
  }

  it("writes a score without an AiNote when showHint is false", async () => {
    const { outbound, conversationId } = await seedOutbound(
      "quality-test-silent@example.com",
      "Добрый день! Получили заявку, подберём варианты и вернёмся.",
    );
    setLlmCompleteForTests(async () => ({
      literacy: 5,
      spelling: 5,
      punctuation: 5,
      businessStyle: 5,
      overall: 5,
      issues: [],
      hint: "",
      showHint: false,
    }));

    expect(await processNextQualityJob(prisma!)).toBe(true);
    const score = await prisma!.qualityScore.findUnique({ where: { messageId: outbound.id } });
    expect(score).toMatchObject({
      literacy: 5,
      spelling: 5,
      showHint: false,
    });
    expect(Number(score?.overall)).toBe(5);
    expect(await prisma!.aiNote.count({ where: { conversationId } })).toBe(0);
    const job = await prisma!.job.findFirst({ where: { conversationId } });
    expect(job?.status).toBe("done");
  });

  it("creates a quality_hint note when the reply is careless", async () => {
    const { outbound, conversationId } = await seedOutbound(
      "quality-test-hint@example.com",
      "ок ща гляну камандировку!!!",
    );
    setLlmCompleteForTests(async () => ({
      literacy: 4,
      spelling: 3,
      punctuation: 2,
      businessStyle: 2,
      overall: 2.8,
      issues: ["Опечатка: «камандировку» → «командировку»", "Сленг: «ок, ща»"],
      hint: "Перепишите нейтрально, без сленга.",
      showHint: true,
    }));

    expect(await processNextQualityJob(prisma!)).toBe(true);
    const note = await prisma!.aiNote.findFirst({ where: { conversationId } });
    expect(note).toMatchObject({
      type: "quality_hint",
      title: "Подсказка по качеству",
      messageId: outbound.id,
      body: "Перепишите нейтрально, без сленга.",
    });
    const score = await prisma!.qualityScore.findUnique({ where: { messageId: outbound.id } });
    expect(score?.showHint).toBe(true);
  });

  it("fails an inbound evaluate_quality job without a score", async () => {
    const inbound = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail: annaEmail,
      gmailUid: "quality-inbound-uid",
      parsed: parseMailFields({
        fromEmail: "quality-test-inbound@example.com",
        subject: "Входящее",
        text: "Здравствуйте",
      }),
    });
    if (inbound.status !== "created") {
      throw new Error("failed to seed inbound");
    }
    await prisma!.job.create({
      data: {
        type: "evaluate_quality",
        status: "pending",
        conversationId: inbound.conversationId,
        messageId: inbound.messageId,
        payload: { messageId: inbound.messageId },
      },
    });
    setLlmCompleteForTests(async () => {
      throw new Error("LLM should not be called for inbound");
    });

    expect(await processNextQualityJob(prisma!)).toBe(true);
    expect(await prisma!.qualityScore.count({ where: { messageId: inbound.messageId } })).toBe(0);
    const job = await prisma!.job.findFirst({ where: { conversationId: inbound.conversationId } });
    expect(job?.status).toBe("failed");
    expect(job?.error).toMatch(/inbound not scored/);
  });

  it("does not claim suggest_travel jobs", async () => {
    const inbound = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail: annaEmail,
      gmailUid: "quality-travel-uid",
      parsed: parseMailFields({
        fromEmail: "quality-test-travel@example.com",
        subject: "Подбор",
        text: "Нужна командировка",
      }),
    });
    if (inbound.status !== "created") {
      throw new Error("failed to seed inbound");
    }
    await prisma!.job.create({
      data: {
        type: "suggest_travel",
        status: "pending",
        conversationId: inbound.conversationId,
        payload: {},
      },
    });
    expect(await processNextQualityJob(prisma!)).toBe(false);
    const job = await prisma!.job.findFirst({ where: { conversationId: inbound.conversationId } });
    expect(job?.status).toBe("pending");
  });
});
