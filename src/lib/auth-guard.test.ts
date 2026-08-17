import { describe, expect, it } from "vitest";
import { authorizeRequest } from "./auth-guard";
import type { SessionUser } from "./auth";

const manager: SessionUser = {
  id: "m36",
  code: "M36",
  name: "Анна Соколова",
  role: "manager",
};

const chief: SessionUser = {
  id: "chief",
  code: "CHIEF",
  name: "Игорь Белов",
  role: "chief",
};

describe("authorizeRequest", () => {
  it("sends a guest from /inbox to /login", () => {
    expect(authorizeRequest("/inbox", "GET", null)).toEqual({
      type: "redirect",
      to: "/login",
    });
  });

  it("redirects a manager away from /admin", () => {
    expect(authorizeRequest("/admin", "GET", manager)).toEqual({
      type: "redirect",
      to: "/inbox",
    });
  });

  it("lets the chief open /admin and /inbox", () => {
    expect(authorizeRequest("/admin", "GET", chief)).toEqual({ type: "next" });
    expect(authorizeRequest("/inbox", "GET", chief)).toEqual({ type: "next" });
  });

  it("keeps debug flights for the chief only", () => {
    expect(authorizeRequest("/api/debug/flights", "GET", null)).toEqual({
      type: "json",
      status: 401,
      error: "Нужно войти",
    });
    expect(authorizeRequest("/api/debug/flights", "GET", manager)).toEqual({
      type: "json",
      status: 403,
      error: "Только для главного менеджера",
    });
    expect(authorizeRequest("/api/debug/flights", "GET", chief)).toEqual({
      type: "next",
    });
  });
});
