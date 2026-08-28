import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedUsers } from "../../../../lib/seed-users";
import { ingestInbound } from "../../../../lib/mail/ingest";
import { parseMailFields } from "../../../../lib/mail/parse";
import { setTrashMailboxForTests } from "../../../../lib/mail/delete-sync";
import { MailTrashError } from "../../../../lib/mail/trash";
import { POST as login } from "../../auth/login/route";
import { DELETE as deleteConversation } from "./route";
import { DELETE as deleteMessage } from "./messages/[messageId]/route";
import { DELETE as deleteNote } from "./notes/[noteId]/route";

const databaseUrl = process.env.DATABASE_URL;
const prisma = databaseUrl ? new PrismaClient() : null;
const EMAIL_PREFIX = "del-test-";

type TrashCall = { inboxUids: string[]; smtpMessageIds: string[] };

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

describe.skipIf(!prisma)("DELETE mail endpoints", () => {
  let annaId = "";
  let dmitryId = "";
  let igorId = "";
  const annaEmail = "communicationassistant36@gmail.com";
  const trashCalls: TrashCall[] = [];
  let trashShouldFail = false;

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
    trashCalls.length = 0;
    trashShouldFail = false;
    setTrashMailboxForTests(async (_account, input) => {
      if (trashShouldFail) {
        throw new MailTrashError("imap down");
      }
      trashCalls.push({
        inboxUids: [...input.inboxUids],
        smtpMessageIds: [...input.smtpMessageIds],
      });
    });
    if (!prisma) {
      return;
    }
    await prisma.client.deleteMany({
      where: { email: { startsWith: EMAIL_PREFIX } },
    });
  });

  afterEach(() => {
    setTrashMailboxForTests(null);
  });

  afterAll(async () => {
    await prisma?.client.deleteMany({
      where: { email: { startsWith: EMAIL_PREFIX } },
    });
    await prisma?.$disconnect();
  });

  async function seedAnnaThread(clientEmail: string, uid: string) {
    const inbound = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail: annaEmail,
      gmailUid: uid,
      parsed: parseMailFields({
        fromEmail: clientEmail,
        fromName: "Клиент",
        subject: "Удаление",
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
        fromEmail: annaEmail,
        toEmail: clientEmail,
        subject: "Re: Удаление",
        bodyText: "Приняли заявку",
        sentAt: new Date(),
        smtpMessageId: `<${uid}@sent.example>`,
      },
    });
    const note = await prisma!.aiNote.create({
      data: {
        conversationId: inbound.conversationId,
        type: "quality_hint",
        title: "Подсказка",
        body: "Перепишите нейтрально.",
        payload: {},
      },
    });
    return { inbound, outbound, note };
  }

  it("lets the owner hide a thread after moving mail to trash", async () => {
    const thread = await seedAnnaThread(`${EMAIL_PREFIX}anna@example.com`, "del-1");
    const cookie = cookieHeader(await loginAs(annaId));
    const response = await deleteConversation(
      new Request(`http://127.0.0.1:3010/api/conversations/${thread.inbound.conversationId}`, {
        method: "DELETE",
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: thread.inbound.conversationId }) },
    );
    expect(response.status).toBe(200);
    expect(trashCalls).toEqual([
      {
        inboxUids: ["del-1"],
        smtpMessageIds: ["<del-1@sent.example>"],
      },
    ]);
    const conversation = await prisma!.conversation.findUnique({
      where: { id: thread.inbound.conversationId },
    });
    const inbound = await prisma!.message.findUnique({ where: { id: thread.inbound.messageId } });
    const outbound = await prisma!.message.findUnique({ where: { id: thread.outbound.id } });
    const note = await prisma!.aiNote.findUnique({ where: { id: thread.note.id } });
    expect(conversation?.deletedAt).not.toBeNull();
    expect(inbound?.deletedAt).not.toBeNull();
    expect(outbound?.deletedAt).not.toBeNull();
    expect(note?.deletedAt).not.toBeNull();
  });

  it("lets the owner hide an outbound letter and forbids deleting inbound", async () => {
    const thread = await seedAnnaThread(`${EMAIL_PREFIX}out@example.com`, "del-2");
    const cookie = cookieHeader(await loginAs(annaId));
    const inboundDenied = await deleteMessage(
      new Request(
        `http://127.0.0.1:3010/api/conversations/${thread.inbound.conversationId}/messages/${thread.inbound.messageId}`,
        { method: "DELETE", headers: { cookie } },
      ),
      {
        params: Promise.resolve({
          id: thread.inbound.conversationId,
          messageId: thread.inbound.messageId,
        }),
      },
    );
    expect(inboundDenied.status).toBe(403);
    expect(trashCalls).toHaveLength(0);
    const stillLive = await prisma!.message.findUnique({
      where: { id: thread.inbound.messageId },
    });
    expect(stillLive?.deletedAt).toBeNull();

    const outboundOk = await deleteMessage(
      new Request(
        `http://127.0.0.1:3010/api/conversations/${thread.inbound.conversationId}/messages/${thread.outbound.id}`,
        { method: "DELETE", headers: { cookie } },
      ),
      {
        params: Promise.resolve({
          id: thread.inbound.conversationId,
          messageId: thread.outbound.id,
        }),
      },
    );
    expect(outboundOk.status).toBe(200);
    expect(trashCalls).toEqual([
      { inboxUids: [], smtpMessageIds: ["<del-2@sent.example>"] },
    ]);
    const hidden = await prisma!.message.findUnique({ where: { id: thread.outbound.id } });
    expect(hidden?.deletedAt).not.toBeNull();
  });

  it("hides an AI card without touching Gmail", async () => {
    const thread = await seedAnnaThread(`${EMAIL_PREFIX}note@example.com`, "del-3");
    const cookie = cookieHeader(await loginAs(annaId));
    const response = await deleteNote(
      new Request(
        `http://127.0.0.1:3010/api/conversations/${thread.inbound.conversationId}/notes/${thread.note.id}`,
        { method: "DELETE", headers: { cookie } },
      ),
      {
        params: Promise.resolve({
          id: thread.inbound.conversationId,
          noteId: thread.note.id,
        }),
      },
    );
    expect(response.status).toBe(200);
    expect(trashCalls).toHaveLength(0);
    const note = await prisma!.aiNote.findUnique({ where: { id: thread.note.id } });
    expect(note?.deletedAt).not.toBeNull();
  });

  it("forbids the chief from deleting anything", async () => {
    const thread = await seedAnnaThread(`${EMAIL_PREFIX}chief@example.com`, "del-4");
    const cookie = cookieHeader(await loginAs(igorId));
    const conversation = await deleteConversation(
      new Request(`http://127.0.0.1:3010/api/conversations/${thread.inbound.conversationId}`, {
        method: "DELETE",
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: thread.inbound.conversationId }) },
    );
    const message = await deleteMessage(
      new Request(
        `http://127.0.0.1:3010/api/conversations/${thread.inbound.conversationId}/messages/${thread.outbound.id}`,
        { method: "DELETE", headers: { cookie } },
      ),
      {
        params: Promise.resolve({
          id: thread.inbound.conversationId,
          messageId: thread.outbound.id,
        }),
      },
    );
    const note = await deleteNote(
      new Request(
        `http://127.0.0.1:3010/api/conversations/${thread.inbound.conversationId}/notes/${thread.note.id}`,
        { method: "DELETE", headers: { cookie } },
      ),
      {
        params: Promise.resolve({
          id: thread.inbound.conversationId,
          noteId: thread.note.id,
        }),
      },
    );
    expect(conversation.status).toBe(403);
    expect(message.status).toBe(403);
    expect(note.status).toBe(403);
    expect(trashCalls).toHaveLength(0);
    const body = (await conversation.json()) as { error: string };
    expect(body.error).toBe("Главный не удаляет переписку");
  });

  it("forbids another manager from deleting Anna's thread", async () => {
    const thread = await seedAnnaThread(`${EMAIL_PREFIX}other@example.com`, "del-5");
    const cookie = cookieHeader(await loginAs(dmitryId));
    const response = await deleteConversation(
      new Request(`http://127.0.0.1:3010/api/conversations/${thread.inbound.conversationId}`, {
        method: "DELETE",
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: thread.inbound.conversationId }) },
    );
    expect(response.status).toBe(403);
    expect(trashCalls).toHaveLength(0);
  });

  it("returns 401 for a guest", async () => {
    const thread = await seedAnnaThread(`${EMAIL_PREFIX}guest@example.com`, "del-6");
    const response = await deleteConversation(
      new Request(`http://127.0.0.1:3010/api/conversations/${thread.inbound.conversationId}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: thread.inbound.conversationId }) },
    );
    expect(response.status).toBe(401);
    expect(trashCalls).toHaveLength(0);
  });

  it("does not hide locally when Gmail trash fails", async () => {
    const thread = await seedAnnaThread(`${EMAIL_PREFIX}fail@example.com`, "del-7");
    trashShouldFail = true;
    const cookie = cookieHeader(await loginAs(annaId));
    const response = await deleteConversation(
      new Request(`http://127.0.0.1:3010/api/conversations/${thread.inbound.conversationId}`, {
        method: "DELETE",
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: thread.inbound.conversationId }) },
    );
    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("Не удалось удалить в почте");
    const conversation = await prisma!.conversation.findUnique({
      where: { id: thread.inbound.conversationId },
    });
    expect(conversation?.deletedAt).toBeNull();
  });
});
