import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedUsers } from "../../../../../lib/seed-users";
import { ingestInbound } from "../../../../../lib/mail/ingest";
import { parseMailFields } from "../../../../../lib/mail/parse";
import { POST as login } from "../../../auth/login/route";
import { POST as suggest } from "./route";

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

async function postSuggest(conversationId: string, cookie: string): Promise<Response> {
  return suggest(
    new Request(`http://127.0.0.1:3010/api/conversations/${conversationId}/suggest`, {
      method: "POST",
      headers: cookie ? { cookie } : undefined,
    }),
    { params: Promise.resolve({ id: conversationId }) },
  );
}

describe.skipIf(!prisma)("POST /api/conversations/:id/suggest", () => {
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
      where: { email: { startsWith: "suggest-test-" } },
    });
  });

  afterAll(async () => {
    await prisma?.client.deleteMany({
      where: { email: { startsWith: "suggest-test-" } },
    });
    await prisma?.$disconnect();
  });

  async function seedThread(managerId: string, managerEmail: string, clientEmail: string) {
    const result = await ingestInbound(prisma!, {
      managerId,
      managerEmail,
      gmailUid: `suggest-${clientEmail}`,
      parsed: parseMailFields({
        fromEmail: clientEmail,
        fromName: "Клиент",
        subject: "Подбор",
        text: "Нужна командировка в Петербург с 1 по 5 сентября, двое.",
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
      "suggest-test-guest@example.com",
    );
    const response = await postSuggest(thread.conversationId, "");
    expect(response.status).toBe(401);
    expect(
      await prisma!.job.count({
        where: { conversationId: thread.conversationId, type: "suggest_travel" },
      }),
    ).toBe(0);
  });

  it("forbids a manager from suggesting in someone else's thread", async () => {
    const thread = await seedThread(
      dmitryId,
      "communicationassistant52@gmail.com",
      "suggest-test-dmitry@example.com",
    );
    const cookie = cookieHeader(await loginAs(annaId));
    const response = await postSuggest(thread.conversationId, cookie);
    expect(response.status).toBe(403);
    expect(
      await prisma!.job.count({
        where: { conversationId: thread.conversationId, type: "suggest_travel" },
      }),
    ).toBe(0);
  });

  it("lets Anna enqueue a pending job and a second click creates another", async () => {
    const thread = await seedThread(
      annaId,
      "communicationassistant36@gmail.com",
      "suggest-test-anna@example.com",
    );
    const cookie = cookieHeader(await loginAs(annaId));
    const first = await postSuggest(thread.conversationId, cookie);
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { jobId: string; status: string };
    expect(firstBody.status).toBe("pending");
    expect(firstBody.jobId).toBeTruthy();

    const second = await postSuggest(thread.conversationId, cookie);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { jobId: string; status: string };
    expect(secondBody.jobId).not.toBe(firstBody.jobId);

    const jobs = await prisma!.job.findMany({
      where: { conversationId: thread.conversationId, type: "suggest_travel" },
      orderBy: { createdAt: "asc" },
    });
    expect(jobs).toHaveLength(2);
    expect(jobs.every((job) => job.status === "pending")).toBe(true);
  });

  it("lets the chief enqueue a job on a manager thread", async () => {
    const thread = await seedThread(
      annaId,
      "communicationassistant36@gmail.com",
      "suggest-test-chief@example.com",
    );
    const cookie = cookieHeader(await loginAs(igorId));
    const response = await postSuggest(thread.conversationId, cookie);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { jobId: string; status: string };
    expect(body.status).toBe("pending");
    const job = await prisma!.job.findUnique({ where: { id: body.jobId } });
    expect(job).toMatchObject({
      type: "suggest_travel",
      status: "pending",
      conversationId: thread.conversationId,
    });
  });
});
