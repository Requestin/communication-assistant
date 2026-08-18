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

  beforeAll(async () => {
    if (!prisma) {
      return;
    }
    await seedUsers(prisma);
    const users = await prisma.user.findMany({ select: { id: true, code: true } });
    annaId = users.find((user) => user.code === "M36")?.id ?? "";
    dmitryId = users.find((user) => user.code === "M52")?.id ?? "";
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
    await ingestInbound(prisma!, {
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
});
