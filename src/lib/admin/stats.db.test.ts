import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as adminStats } from "../../app/api/admin/stats/route";
import { GET as managerClients } from "../../app/api/admin/managers/[id]/clients/route";
import { POST as login } from "../../app/api/auth/login/route";
import { GET as snapshot } from "../../app/api/inbox/snapshot/route";
import { ingestInbound } from "../mail/ingest";
import { parseMailFields } from "../mail/parse";
import { seedUsers } from "../seed-users";
import { averageOverall, buildAdminStats, hintRate } from "./stats";
import type { InboxSnapshotDto } from "../inbox";

const databaseUrl = process.env.DATABASE_URL;
const prisma = databaseUrl ? new PrismaClient() : null;
const EMAIL_PREFIX = "admin-test-";

function cookieHeader(response: Response): string {
  const raw = response.headers.get("set-cookie") ?? "";
  const match = /ca_session=([^;]+)/.exec(raw);
  return match ? `ca_session=${match[1]}` : "";
}

async function loginAs(userId: string): Promise<Response> {
  return login(
    new Request("http://127.0.0.1:3010/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    }),
  );
}

describe.skipIf(!prisma)("admin stats against Postgres", () => {
  let annaId = "";
  let dmitryId = "";
  let igorId = "";
  const annaEmail = "communicationassistant36@gmail.com";
  const dmitryEmail = "communicationassistant52@gmail.com";

  beforeAll(async () => {
    if (!prisma) {
      return;
    }
    await seedUsers(prisma);
    const users = await prisma.user.findMany({ select: { id: true, code: true } });
    annaId = users.find((user) => user.code === "M36")?.id ?? "";
    dmitryId = users.find((user) => user.code === "M52")?.id ?? "";
    igorId = users.find((user) => user.code === "CHIEF")?.id ?? "";
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

  async function seedScoredReply(input: {
    managerId: string;
    managerEmail: string;
    clientEmail: string;
    subject: string;
    overall: number;
    showHint: boolean;
    offer?: boolean;
  }): Promise<{ conversationId: string; messageId: string }> {
    const inbound = await ingestInbound(prisma!, {
      managerId: input.managerId,
      managerEmail: input.managerEmail,
      gmailUid: `admin-${input.clientEmail}`,
      parsed: parseMailFields({
        fromEmail: input.clientEmail,
        fromName: "Клиент админки",
        subject: input.subject,
        text: "Нужна командировка",
      }),
    });
    if (inbound.status !== "created") {
      throw new Error("failed to seed inbound");
    }
    const outbound = await prisma!.message.create({
      data: {
        conversationId: inbound.conversationId,
        direction: "outbound",
        fromEmail: input.managerEmail,
        toEmail: input.clientEmail,
        subject: `Re: ${input.subject}`,
        bodyText: "admin-test reply",
        sentAt: new Date(),
      },
    });
    const score = Math.round(input.overall);
    await prisma!.qualityScore.create({
      data: {
        messageId: outbound.id,
        managerId: input.managerId,
        literacy: score,
        spelling: score,
        punctuation: score,
        businessStyle: score,
        overall: input.overall,
        issues: [],
        showHint: input.showHint,
      },
    });
    if (input.offer) {
      await prisma!.aiNote.create({
        data: {
          conversationId: inbound.conversationId,
          type: "travel_offer",
          title: "Подбор",
          body: "Подбор командировки",
          payload: {},
        },
      });
    }
    return { conversationId: inbound.conversationId, messageId: outbound.id };
  }

  it("matches Prisma aggregates after two managers get different scores", async () => {
    const before = await buildAdminStats(prisma!);

    await seedScoredReply({
      managerId: annaId,
      managerEmail: annaEmail,
      clientEmail: `${EMAIL_PREFIX}anna-good@example.com`,
      subject: "Петербург",
      overall: 5,
      showHint: false,
    });
    const annaThread = await seedScoredReply({
      managerId: annaId,
      managerEmail: annaEmail,
      clientEmail: `${EMAIL_PREFIX}anna-hint@example.com`,
      subject: "Казань",
      overall: 3,
      showHint: true,
      offer: true,
    });
    await seedScoredReply({
      managerId: dmitryId,
      managerEmail: dmitryEmail,
      clientEmail: `${EMAIL_PREFIX}dmitry@example.com`,
      subject: "Владивосток",
      overall: 4,
      showHint: false,
    });

    const after = await buildAdminStats(prisma!);
    const anna = after.managers.find((row) => row.code === "M36");
    const dmitry = after.managers.find((row) => row.code === "M52");
    const elena = after.managers.find((row) => row.code === "M65");
    expect(after.managers).toHaveLength(3);
    expect(elena).toBeDefined();

    const annaBefore = before.managers.find((row) => row.code === "M36");
    const dmitryBefore = before.managers.find((row) => row.code === "M52");
    expect(anna?.replies).toBe((annaBefore?.replies ?? 0) + 2);
    expect(dmitry?.replies).toBe((dmitryBefore?.replies ?? 0) + 1);
    expect(after.department.replies).toBe(before.department.replies + 3);
    expect(after.department.suggestions).toBe(before.department.suggestions + 1);
    expect(anna?.suggestions).toBe((annaBefore?.suggestions ?? 0) + 1);
    expect(anna?.clients).toBe((annaBefore?.clients ?? 0) + 2);

    const annaScores = await prisma!.qualityScore.findMany({ where: { managerId: annaId } });
    const dmitryScores = await prisma!.qualityScore.findMany({ where: { managerId: dmitryId } });
    const allScores = await prisma!.qualityScore.findMany();
    expect(anna?.avgScore).toBe(averageOverall(annaScores.map((row) => Number(row.overall))));
    expect(dmitry?.avgScore).toBe(averageOverall(dmitryScores.map((row) => Number(row.overall))));
    expect(anna?.hintRate).toBe(
      hintRate(annaScores.filter((row) => row.showHint).length, annaScores.length),
    );
    expect(dmitry?.hintRate).toBe(
      hintRate(dmitryScores.filter((row) => row.showHint).length, dmitryScores.length),
    );
    expect(after.department.avgScore).toBe(
      averageOverall(allScores.map((row) => Number(row.overall))),
    );
    expect(after.department.hintRate).toBe(
      hintRate(allScores.filter((row) => row.showHint).length, allScores.length),
    );
    expect(after.charts.overallByDay.length).toBeGreaterThan(0);
    expect(after.charts.overallSeries).toHaveLength(allScores.length);
    expect(after.charts.scoreByManager).toHaveLength(3);

    const cookie = cookieHeader(await loginAs(igorId));
    const clients = await managerClients(
      new Request(`http://127.0.0.1:3010/api/admin/managers/${annaId}/clients`, {
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: annaId }) },
    );
    expect(clients.status).toBe(200);
    const clientsBody = (await clients.json()) as {
      manager: { code: string };
      clients: Array<{ email: string; conversations: Array<{ id: string }> }>;
    };
    expect(clientsBody.manager.code).toBe("M36");
    expect(clientsBody.clients.some((row) => row.email === `${EMAIL_PREFIX}anna-hint@example.com`)).toBe(
      true,
    );
    expect(
      clientsBody.clients.some((row) =>
        row.conversations.some((item) => item.id === annaThread.conversationId),
      ),
    ).toBe(true);

    const inbox = await snapshot(
      new Request("http://127.0.0.1:3010/api/inbox/snapshot?manager=M36", {
        headers: { cookie },
      }),
    );
    expect(inbox.status).toBe(200);
    const inboxBody = (await inbox.json()) as InboxSnapshotDto;
    const emails = inboxBody.conversations.map((item) => item.clientEmail);
    expect(emails).toContain(`${EMAIL_PREFIX}anna-hint@example.com`);
    expect(emails).not.toContain(`${EMAIL_PREFIX}dmitry@example.com`);
  });

  it("rejects guests and managers on admin APIs and 404s unknown managers", async () => {
    const guest = await adminStats(new Request("http://127.0.0.1:3010/api/admin/stats"));
    expect(guest.status).toBe(401);

    const annaCookie = cookieHeader(await loginAs(annaId));
    const forbiddenStats = await adminStats(
      new Request("http://127.0.0.1:3010/api/admin/stats", { headers: { cookie: annaCookie } }),
    );
    expect(forbiddenStats.status).toBe(403);

    const forbiddenClients = await managerClients(
      new Request(`http://127.0.0.1:3010/api/admin/managers/${annaId}/clients`, {
        headers: { cookie: annaCookie },
      }),
      { params: Promise.resolve({ id: annaId }) },
    );
    expect(forbiddenClients.status).toBe(403);

    const igorCookie = cookieHeader(await loginAs(igorId));
    const missing = await managerClients(
      new Request(`http://127.0.0.1:3010/api/admin/managers/${igorId}/clients`, {
        headers: { cookie: igorCookie },
      }),
      { params: Promise.resolve({ id: igorId }) },
    );
    expect(missing.status).toBe(404);

    const ok = await adminStats(
      new Request("http://127.0.0.1:3010/api/admin/stats", { headers: { cookie: igorCookie } }),
    );
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as {
      managers: unknown[];
      charts: { overallByDay: unknown[]; overallSeries: unknown[] };
    };
    expect(body.managers).toHaveLength(3);
    expect(Array.isArray(body.charts.overallByDay)).toBe(true);
    expect(Array.isArray(body.charts.overallSeries)).toBe(true);
  });

  it("does not drop replies, suggestions, AVG or hint rate after a soft hide", async () => {
    const seeded = await seedScoredReply({
      managerId: annaId,
      managerEmail: annaEmail,
      clientEmail: `${EMAIL_PREFIX}soft-hide@example.com`,
      subject: "Сочи",
      overall: 4,
      showHint: true,
      offer: true,
    });
    const beforeHide = await buildAdminStats(prisma!);
    const at = new Date();
    await prisma!.conversation.update({
      where: { id: seeded.conversationId },
      data: { deletedAt: at },
    });
    await prisma!.message.updateMany({
      where: { conversationId: seeded.conversationId },
      data: { deletedAt: at },
    });
    await prisma!.aiNote.updateMany({
      where: { conversationId: seeded.conversationId },
      data: { deletedAt: at },
    });
    const afterHide = await buildAdminStats(prisma!);
    expect(afterHide.department.replies).toBe(beforeHide.department.replies);
    expect(afterHide.department.suggestions).toBe(beforeHide.department.suggestions);
    expect(afterHide.department.avgScore).toBe(beforeHide.department.avgScore);
    expect(afterHide.department.hintRate).toBe(beforeHide.department.hintRate);
    const annaBefore = beforeHide.managers.find((row) => row.code === "M36");
    const annaAfter = afterHide.managers.find((row) => row.code === "M36");
    expect(annaAfter?.replies).toBe(annaBefore?.replies);
    expect(annaAfter?.suggestions).toBe(annaBefore?.suggestions);
    expect(annaAfter?.avgScore).toBe(annaBefore?.avgScore);
    expect(annaAfter?.hintRate).toBe(annaBefore?.hintRate);
  });
});
