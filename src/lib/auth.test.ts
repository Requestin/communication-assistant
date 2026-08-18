import { describe, expect, it } from "vitest";
import { isHttpsRequest, sessionCookieOptions, signSession, verifySession, type SessionUser } from "./auth";

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

  it("marks the session cookie Secure only behind HTTPS", () => {
    const httpRequest = new Request("http://127.0.0.1:3010/api/auth/login");
    const httpsRequest = new Request("http://127.0.0.1:3010/api/auth/login", {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(isHttpsRequest(httpRequest)).toBe(false);
    expect(sessionCookieOptions(httpRequest).secure).toBe(false);
    expect(isHttpsRequest(httpsRequest)).toBe(true);
    expect(sessionCookieOptions(httpsRequest).secure).toBe(true);
  });

  it("rejects an expired token", async () => {
    const token = await signSession(user, {
      expiresIn: Math.floor(Date.now() / 1000) - 60,
    });
    await expect(verifySession(token)).resolves.toBeNull();
  });
});
