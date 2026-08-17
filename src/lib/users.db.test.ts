import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { SEED_USERS, seedUsers } from "./seed-users";

const databaseUrl = process.env.DATABASE_URL;
const prisma = databaseUrl ? new PrismaClient() : null;

describe.skipIf(!prisma)("user seed against Postgres", () => {
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("upserts four users and does not duplicate on a second run", async () => {
    if (!prisma) {
      return;
    }

    await seedUsers(prisma);
    await seedUsers(prisma);

    const users = await prisma.user.findMany({
      orderBy: { code: "asc" },
      select: { code: true, name: true, role: true, email: true },
    });

    expect(users).toHaveLength(4);
    expect(users.map((user) => user.code).sort()).toEqual(
      SEED_USERS.map((user) => user.code).sort(),
    );

    const chief = users.find((user) => user.code === "CHIEF");
    expect(chief?.role).toBe("chief");
    expect(chief?.email).toBeNull();

    const managers = users.filter((user) => user.role === "manager");
    expect(managers).toHaveLength(3);
    expect(managers.every((user) => Boolean(user.email))).toBe(true);
  });
});
