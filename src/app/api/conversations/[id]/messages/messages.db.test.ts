import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedUsers } from "../../../../../lib/seed-users";
import { ingestInbound } from "../../../../../lib/mail/ingest";
import { parseMailFields } from "../../../../../lib/mail/parse";
import { setSmtpTransportForTests, type SmtpTransport } from "../../../../../lib/mail/smtp";
import { POST as login } from "../../../auth/login/route";
import { POST as sendMessage } from "./route";

const databaseUrl = process.env.DATABASE_URL;
const prisma = databaseUrl ? new PrismaClient() : null;

type SentMail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  headers: Record<string, string>;
};

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

function mockSmtp(sent: SentMail[]): SmtpTransport {
  return {
    async sendMail(options) {
      sent.push(options);
      return { messageId: "<mock-smtp@test>" };
    },
  };
}

async function postReply(conversationId: string, cookie: string, bodyText: string): Promise<Response> {
  return sendMessage(
    new Request(`http://127.0.0.1:3010/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ bodyText }),
    }),
    { params: Promise.resolve({ id: conversationId }) },
  );
}

describe.skipIf(!prisma)("POST /api/conversations/:id/messages", () => {
  let annaId = "";
  let dmitryId = "";
  let igorId = "";
  const sent: SentMail[] = [];

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
    sent.length = 0;
    setSmtpTransportForTests(mockSmtp(sent));
    if (!prisma) {
      return;
    }
    await prisma.client.deleteMany({
      where: { email: { startsWith: "smtp-test-" } },
    });
  });

  afterEach(() => {
    setSmtpTransportForTests(null);
  });

  afterAll(async () => {
    await prisma?.client.deleteMany({
      where: { email: { startsWith: "smtp-test-" } },
    });
    await prisma?.$disconnect();
  });

  async function seedThread(managerId: string, managerEmail: string, clientEmail: string) {
    const result = await ingestInbound(prisma!, {
      managerId,
      managerEmail,
      gmailUid: `smtp-${clientEmail}`,
      parsed: parseMailFields({
        fromEmail: clientEmail,
        fromName: "Клиент",
        subject: "Тест IMAP",
        text: "Нужна командировка",
        messageId: `<in-${clientEmail}>`,
      }),
    });
    if (result.status !== "created") {
      throw new Error("failed to seed thread");
    }
    return result;
  }

  it("rejects a guest", async () => {
    const thread = await seedThread(
      annaId,
      "communicationassistant36@gmail.com",
      "smtp-test-guest@example.com",
    );
    const response = await postReply(thread.conversationId, "", "Добрый день");
    expect(response.status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it("forbids the chief from sending", async () => {
    const thread = await seedThread(
      annaId,
      "communicationassistant36@gmail.com",
      "smtp-test-chief@example.com",
    );
    const cookie = cookieHeader(await loginAs(igorId));
    const response = await postReply(thread.conversationId, cookie, "Добрый день");
    expect(response.status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  it("forbids a manager from writing in someone else's thread", async () => {
    const thread = await seedThread(
      dmitryId,
      "communicationassistant52@gmail.com",
      "smtp-test-dmitry@example.com",
    );
    const cookie = cookieHeader(await loginAs(annaId));
    const response = await postReply(thread.conversationId, cookie, "Добрый день");
    expect(response.status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  it("sends Anna's reply through the mock and stores one outbound", async () => {
    const thread = await seedThread(
      annaId,
      "communicationassistant36@gmail.com",
      "smtp-test-anna@example.com",
    );
    const cookie = cookieHeader(await loginAs(annaId));
    const response = await postReply(
      thread.conversationId,
      cookie,
      "Добрый день! Получили заявку, подберём варианты и вернёмся.",
    );
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      from: "communicationassistant36@gmail.com",
      to: "smtp-test-anna@example.com",
      subject: "Re: Тест IMAP",
      headers: { "X-CommAssist": "1", "In-Reply-To": "<in-smtp-test-anna@example.com>" },
    });

    const outbound = await prisma!.message.findMany({
      where: { conversationId: thread.conversationId, direction: "outbound" },
    });
    expect(outbound).toHaveLength(1);
    expect(outbound[0]?.smtpMessageId).toBe("<mock-smtp@test>");

    const conversation = await prisma!.conversation.findUnique({
      where: { id: thread.conversationId },
    });
    expect(conversation?.subject).toBe("Re: Тест IMAP");
    expect(conversation?.lastMessageAt.getTime()).toBe(outbound[0]?.sentAt.getTime());

    const jobs = await prisma!.job.findMany({ where: { conversationId: thread.conversationId } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      type: "evaluate_quality",
      status: "pending",
      messageId: outbound[0]?.id,
    });
  });
});
