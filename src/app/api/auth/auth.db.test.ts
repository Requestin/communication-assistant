import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as adminStats } from "../admin/stats/route";
import { GET as debugFlights } from "../debug/flights/route";
import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";
import { GET as me } from "./me/route";
import { seedUsers } from "../../../lib/seed-users";

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

describe.skipIf(!prisma)("auth API against Postgres", () => {
  let annaId = "";
  let igorId = "";

  beforeAll(async () => {
    if (!prisma) {
      return;
    }
    await seedUsers(prisma);
    const users = await prisma.user.findMany({ select: { id: true, code: true } });
    annaId = users.find((user) => user.code === "M36")?.id ?? "";
    igorId = users.find((user) => user.code === "CHIEF")?.id ?? "";
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("sets ca_session for an existing user and rejects an unknown id", async () => {
    const ok = await loginAs(annaId);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie") ?? "").toMatch(/ca_session=/);

    const missing = await loginAs("00000000-0000-4000-8000-000000000000");
    expect(missing.status).toBe(404);

    const empty = await login(
      new Request("http://127.0.0.1:3010/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(empty.status).toBe(400);
  });

  it("returns manager and chief roles from /me and clears the cookie on logout", async () => {
    const annaLogin = await loginAs(annaId);
    const annaMe = await me(
      new Request("http://127.0.0.1:3010/api/auth/me", {
        headers: { cookie: cookieHeader(annaLogin) },
      }),
    );
    expect(annaMe.status).toBe(200);
    await expect(annaMe.json()).resolves.toMatchObject({
      code: "M36",
      role: "manager",
      name: "Анна Соколова",
    });

    const igorLogin = await loginAs(igorId);
    const igorMe = await me(
      new Request("http://127.0.0.1:3010/api/auth/me", {
        headers: { cookie: cookieHeader(igorLogin) },
      }),
    );
    expect(igorMe.status).toBe(200);
    await expect(igorMe.json()).resolves.toMatchObject({
      code: "CHIEF",
      role: "chief",
    });

    const loggedOut = await logout();
    expect(loggedOut.status).toBe(200);
    expect(loggedOut.headers.get("set-cookie") ?? "").toMatch(/ca_session=/);

    const afterLogout = await me(new Request("http://127.0.0.1:3010/api/auth/me"));
    expect(afterLogout.status).toBe(401);
  });

  it("forbids admin stats and debug flights for a manager", async () => {
    const annaLogin = await loginAs(annaId);
    const cookie = cookieHeader(annaLogin);

    const stats = await adminStats(
      new Request("http://127.0.0.1:3010/api/admin/stats", {
        headers: { cookie },
      }),
    );
    expect(stats.status).toBe(403);

    const flights = await debugFlights(
      new Request("http://127.0.0.1:3010/api/debug/flights?from=MOW&to=LED&date=2026-09-01", {
        headers: { cookie },
      }),
    );
    expect(flights.status).toBe(403);
  });

  it("lets the chief read admin stats and debug flights", async () => {
    const igorLogin = await loginAs(igorId);
    const cookie = cookieHeader(igorLogin);

    const stats = await adminStats(
      new Request("http://127.0.0.1:3010/api/admin/stats", {
        headers: { cookie },
      }),
    );
    expect(stats.status).toBe(200);
    const body = (await stats.json()) as {
      department: { replies: number };
      managers: Array<{ code: string }>;
      charts: { scoreByManager: unknown[] };
    };
    expect(typeof body.department.replies).toBe("number");
    expect(body.managers).toHaveLength(3);
    expect(body.charts.scoreByManager).toHaveLength(3);

    const anonymous = await debugFlights(
      new Request("http://127.0.0.1:3010/api/debug/flights?from=MOW&to=LED&date=2026-09-01"),
    );
    expect(anonymous.status).toBe(401);

    const flights = await debugFlights(
      new Request("http://127.0.0.1:3010/api/debug/flights?from=MOW&to=LED&date=2026-09-01", {
        headers: { cookie },
      }),
    );
    expect(flights.status).toBe(200);
  });
});
