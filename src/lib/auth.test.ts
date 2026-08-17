import { describe, expect, it } from "vitest";
import { signSession, verifySession, type SessionUser } from "./auth";

const user: SessionUser = {
  id: "user-1",
  code: "M36",
  name: "Анна Соколова",
  role: "manager",
};

describe("session JWT", () => {
  it("round-trips a session with the same secret", async () => {
    const token = await signSession(user);
    await expect(verifySession(token)).resolves.toEqual(user);
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signSession(user, { secret: "a".repeat(32) });
    await expect(verifySession(token, "b".repeat(32))).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await signSession(user, {
      expiresIn: Math.floor(Date.now() / 1000) - 60,
    });
    await expect(verifySession(token)).resolves.toBeNull();
  });
});
