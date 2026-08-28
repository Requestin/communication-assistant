import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedUsers } from "../../../../lib/seed-users";
import { ingestInbound } from "../../../../lib/mail/ingest";
import { parseMailFields } from "../../../../lib/mail/parse";
import { POST as login } from "../../auth/login/route";
import { GET as snapshot } from "./route";
import type { InboxSnapshotDto } from "../../../../lib/inbox";

const databaseUrl = process.env.DATABASE_URL;
const prisma = databaseUrl ? new PrismaClient() : null;

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

describe.skipIf(!prisma)("GET /api/inbox/snapshot", () => {
  let annaId = "";
  let dmitryId = "";
  let igorId = "";

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
      where: { email: { startsWith: "imap-test-" } },
    });
  });

  afterAll(async () => {
    await prisma?.client.deleteMany({
      where: { email: { startsWith: "imap-test-" } },
    });
    await prisma?.$disconnect();
  });

  it("rejects a guest", async () => {
    const response = await snapshot(new Request("http://127.0.0.1:3010/api/inbox/snapshot"));
    expect(response.status).toBe(401);
  });

  it("shows Anna only her thread and does not leak Dmitry's", async () => {
    await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail: "communicationassistant36@gmail.com",
      gmailUid: "2001",
      parsed: parseMailFields({
        fromEmail: "imap-test-anna@example.com",
        fromName: "Клиент Анны",
        subject: "Анне",
        text: "Письмо Анне",
      }),
    });
    const dmitryInbound = await ingestInbound(prisma!, {
      managerId: dmitryId,
      managerEmail: "communicationassistant52@gmail.com",
      gmailUid: "2002",
      parsed: parseMailFields({
        fromEmail: "imap-test-dmitry@example.com",
        fromName: "Клиент Дмитрия",
        subject: "Дмитрию",
        text: "Чужое письмо",
      }),
    });
    if (dmitryInbound.status !== "created") {
      throw new Error("failed to seed dmitry thread");
    }

    const cookie = cookieHeader(await loginAs(annaId));
    const list = await snapshot(
      new Request("http://127.0.0.1:3010/api/inbox/snapshot", { headers: { cookie } }),
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as InboxSnapshotDto;
    const emails = body.conversations.map((item) => item.clientEmail);
    expect(emails).toContain("imap-test-anna@example.com");
    expect(emails).not.toContain("imap-test-dmitry@example.com");
    expect(body.notes).toEqual([]);
    expect(body.managers).toBeUndefined();
    const annaThread = body.conversations.find(
      (item) => item.clientEmail === "imap-test-anna@example.com",
    );

    const thread = await snapshot(
      new Request(
        `http://127.0.0.1:3010/api/inbox/snapshot?conversationId=${annaThread?.id}`,
        { headers: { cookie } },
      ),
    );
    const threadBody = (await thread.json()) as InboxSnapshotDto;
    expect(threadBody.messages).toHaveLength(1);
    expect(threadBody.messages[0]?.bodyText).toBe("Письмо Анне");
    expect(threadBody.openConversation?.id).toBe(annaThread?.id);

    const leaked = await snapshot(
      new Request(
        `http://127.0.0.1:3010/api/inbox/snapshot?conversationId=${dmitryInbound.conversationId}`,
        { headers: { cookie } },
      ),
    );
    const leakedBody = (await leaked.json()) as InboxSnapshotDto;
    expect(leakedBody.messages).toEqual([]);
    expect(leakedBody.openConversation).toBeUndefined();

    const again = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail: "communicationassistant36@gmail.com",
      gmailUid: "2001",
      parsed: parseMailFields({
        fromEmail: "imap-test-anna@example.com",
        subject: "Анне",
        text: "Письмо Анне",
      }),
    });
    expect(again.status).toBe("duplicate");

    const afterDup = await snapshot(
      new Request(
        `http://127.0.0.1:3010/api/inbox/snapshot?conversationId=${annaThread?.id}`,
        { headers: { cookie } },
      ),
    );
    const afterDupBody = (await afterDup.json()) as InboxSnapshotDto;
    expect(afterDupBody.messages).toHaveLength(1);
  });

  it("lets the chief see all threads with manager names, or filter to one manager", async () => {
    await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail: "communicationassistant36@gmail.com",
      gmailUid: "2401",
      parsed: parseMailFields({
        fromEmail: "imap-test-chief-anna@example.com",
        fromName: "Клиент Анны",
        subject: "Анне",
        text: "Письмо Анне",
      }),
    });
    await ingestInbound(prisma!, {
      managerId: dmitryId,
      managerEmail: "communicationassistant52@gmail.com",
      gmailUid: "2402",
      parsed: parseMailFields({
        fromEmail: "imap-test-chief-dmitry@example.com",
        fromName: "Клиент Дмитрия",
        subject: "Дмитрию",
        text: "Письмо Дмитрию",
      }),
    });

    const cookie = cookieHeader(await loginAs(igorId));
    const all = await snapshot(
      new Request("http://127.0.0.1:3010/api/inbox/snapshot", { headers: { cookie } }),
    );
    expect(all.status).toBe(200);
    const allBody = (await all.json()) as InboxSnapshotDto;
    const byEmail = Object.fromEntries(
      allBody.conversations.map((item) => [item.clientEmail, item]),
    );
    expect(byEmail["imap-test-chief-anna@example.com"]?.managerName).toBe("Анна Соколова");
    expect(byEmail["imap-test-chief-anna@example.com"]?.managerCode).toBe("M36");
    expect(byEmail["imap-test-chief-dmitry@example.com"]?.managerName).toBe("Дмитрий Орлов");
    expect(allBody.managers?.map((item) => item.code).sort()).toEqual(["M36", "M52", "M65"]);

    const filtered = await snapshot(
      new Request("http://127.0.0.1:3010/api/inbox/snapshot?manager=M36", {
        headers: { cookie },
      }),
    );
    const filteredBody = (await filtered.json()) as InboxSnapshotDto;
    const emails = filteredBody.conversations.map((item) => item.clientEmail);
    expect(emails).toContain("imap-test-chief-anna@example.com");
    expect(emails).not.toContain("imap-test-chief-dmitry@example.com");
    expect(filteredBody.managers?.some((item) => item.code === "M36")).toBe(true);

    const dmitryThread = allBody.conversations.find(
      (item) => item.clientEmail === "imap-test-chief-dmitry@example.com",
    );
    const kept = await snapshot(
      new Request(
        `http://127.0.0.1:3010/api/inbox/snapshot?manager=M36&conversationId=${dmitryThread?.id}`,
        { headers: { cookie } },
      ),
    );
    const keptBody = (await kept.json()) as InboxSnapshotDto;
    expect(keptBody.conversations.map((item) => item.clientEmail)).not.toContain(
      "imap-test-chief-dmitry@example.com",
    );
    expect(keptBody.messages).toHaveLength(1);
    expect(keptBody.messages[0]?.bodyText).toBe("Письмо Дмитрию");
    expect(keptBody.openConversation?.clientEmail).toBe("imap-test-chief-dmitry@example.com");
    expect(keptBody.openConversation?.managerName).toBe("Дмитрий Орлов");
  });

  it("returns staff quality notes only for the open thread", async () => {
    const inbound = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail: "communicationassistant36@gmail.com",
      gmailUid: "2101",
      parsed: parseMailFields({
        fromEmail: "imap-test-note@example.com",
        fromName: "Клиент с подсказкой",
        subject: "Заявка",
        text: "Нужна командировка",
      }),
    });
    if (inbound.status !== "created") {
      throw new Error("failed to seed thread");
    }

    await prisma!.aiNote.create({
      data: {
        conversationId: inbound.conversationId,
        messageId: inbound.messageId,
        type: "quality_hint",
        title: "Подсказка по качеству",
        body: "Перепишите нейтрально.",
        payload: {
          literacy: 4,
          spelling: 3,
          punctuation: 2,
          businessStyle: 2,
          overall: 2.8,
          issues: ["Сленг"],
          hint: "Перепишите нейтрально.",
          showHint: true,
        },
      },
    });

    const cookie = cookieHeader(await loginAs(annaId));
    const list = await snapshot(
      new Request("http://127.0.0.1:3010/api/inbox/snapshot", { headers: { cookie } }),
    );
    const listBody = (await list.json()) as InboxSnapshotDto;
    expect(listBody.notes).toEqual([]);

    const thread = await snapshot(
      new Request(
        `http://127.0.0.1:3010/api/inbox/snapshot?conversationId=${inbound.conversationId}`,
        { headers: { cookie } },
      ),
    );
    const threadBody = (await thread.json()) as InboxSnapshotDto;
    expect(threadBody.notes).toHaveLength(1);
    expect(threadBody.notes[0]).toMatchObject({
      type: "quality_hint",
      title: "Подсказка по качеству",
      body: "Перепишите нейтрально.",
      spelling: 3,
      overall: 2.8,
      issues: ["Сленг"],
      payload: expect.objectContaining({ spelling: 3, hint: "Перепишите нейтрально." }),
    });
    expect(threadBody.jobs).toEqual([]);
  });

  it("returns pending suggest_travel jobs for the open thread", async () => {
    const inbound = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail: "communicationassistant36@gmail.com",
      gmailUid: "2201",
      parsed: parseMailFields({
        fromEmail: "imap-test-suggest@example.com",
        fromName: "Клиент подбора",
        subject: "Петербург",
        text: "Нужна командировка в Петербург",
      }),
    });
    if (inbound.status !== "created") {
      throw new Error("failed to seed thread");
    }
    const job = await prisma!.job.create({
      data: {
        type: "suggest_travel",
        status: "pending",
        conversationId: inbound.conversationId,
        payload: {},
      },
    });

    const cookie = cookieHeader(await loginAs(annaId));
    const list = await snapshot(
      new Request("http://127.0.0.1:3010/api/inbox/snapshot", { headers: { cookie } }),
    );
    const listBody = (await list.json()) as InboxSnapshotDto;
    expect(listBody.jobs).toEqual([]);

    const thread = await snapshot(
      new Request(
        `http://127.0.0.1:3010/api/inbox/snapshot?conversationId=${inbound.conversationId}`,
        { headers: { cookie } },
      ),
    );
    const threadBody = (await thread.json()) as InboxSnapshotDto;
    expect(threadBody.jobs).toEqual([
      { id: job.id, type: "suggest_travel", status: "pending" },
    ]);
  });

  it("returns a Russian quality-failed alert without the job error payload", async () => {
    const inbound = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail: "communicationassistant36@gmail.com",
      gmailUid: "2301",
      parsed: parseMailFields({
        fromEmail: "imap-test-fail@example.com",
        fromName: "Клиент",
        subject: "Оценка",
        text: "Нужна командировка",
      }),
    });
    if (inbound.status !== "created") {
      throw new Error("failed to seed thread");
    }
    await prisma!.job.create({
      data: {
        type: "evaluate_quality",
        status: "failed",
        conversationId: inbound.conversationId,
        payload: {},
        error: "ECONNREFUSED 127.0.0.1:8088 secret=should-not-leak",
      },
    });

    const cookie = cookieHeader(await loginAs(annaId));
    const thread = await snapshot(
      new Request(
        `http://127.0.0.1:3010/api/inbox/snapshot?conversationId=${inbound.conversationId}`,
        { headers: { cookie } },
      ),
    );
    const body = (await thread.json()) as InboxSnapshotDto;
    expect(body.alerts).toEqual([
      { kind: "quality_failed", message: "Не удалось оценить ответ" },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|secret=/);
  });

  it("omits hidden conversations and messages from the snapshot", async () => {
    const live = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail: "communicationassistant36@gmail.com",
      gmailUid: "2501",
      parsed: parseMailFields({
        fromEmail: "imap-test-live@example.com",
        fromName: "Живой",
        subject: "Живая тема",
        text: "Живое письмо",
      }),
    });
    const hidden = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail: "communicationassistant36@gmail.com",
      gmailUid: "2502",
      parsed: parseMailFields({
        fromEmail: "imap-test-hidden@example.com",
        fromName: "Скрытый",
        subject: "Скрытая тема",
        text: "Скрытое письмо",
      }),
    });
    expect(live.status).toBe("created");
    expect(hidden.status).toBe("created");
    if (live.status !== "created" || hidden.status !== "created") {
      return;
    }

    await prisma!.conversation.update({
      where: { id: hidden.conversationId },
      data: { deletedAt: new Date() },
    });
    await prisma!.message.update({
      where: { id: hidden.messageId },
      data: { deletedAt: new Date() },
    });
    await prisma!.message.create({
      data: {
        conversationId: live.conversationId,
        direction: "outbound",
        fromEmail: "communicationassistant36@gmail.com",
        toEmail: "imap-test-live@example.com",
        subject: "Re: Живая тема",
        bodyText: "Скрытый исходящий",
        sentAt: new Date(),
        deletedAt: new Date(),
      },
    });

    const cookie = cookieHeader(await loginAs(annaId));
    const list = await snapshot(
      new Request("http://127.0.0.1:3010/api/inbox/snapshot", { headers: { cookie } }),
    );
    const listBody = (await list.json()) as InboxSnapshotDto;
    const emails = listBody.conversations.map((item) => item.clientEmail);
    expect(emails).toContain("imap-test-live@example.com");
    expect(emails).not.toContain("imap-test-hidden@example.com");
    expect(listBody.conversations.find((item) => item.id === live.conversationId)?.preview).toBe(
      "Живое письмо",
    );

    const thread = await snapshot(
      new Request(
        `http://127.0.0.1:3010/api/inbox/snapshot?conversationId=${live.conversationId}`,
        { headers: { cookie } },
      ),
    );
    const threadBody = (await thread.json()) as InboxSnapshotDto;
    expect(threadBody.messages.map((item) => item.bodyText)).toEqual(["Живое письмо"]);

    const hiddenThread = await snapshot(
      new Request(
        `http://127.0.0.1:3010/api/inbox/snapshot?conversationId=${hidden.conversationId}`,
        { headers: { cookie } },
      ),
    );
    const hiddenBody = (await hiddenThread.json()) as InboxSnapshotDto;
    expect(hiddenBody.messages).toEqual([]);
    expect(hiddenBody.openConversation).toBeUndefined();
  });
});
