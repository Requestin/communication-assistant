import { describe, expect, it, vi } from "vitest";
import { fetchInboxSnapshot, inboxSnapshotQuery } from "./inbox-fetch";

const emptySnapshot = {
  conversations: [],
  messages: [],
  notes: [],
  jobs: [],
  alerts: [],
};

describe("inboxSnapshotQuery", () => {
  it("is empty without filters", () => {
    expect(inboxSnapshotQuery({})).toBe("");
  });

  it("adds conversation and manager", () => {
    expect(
      inboxSnapshotQuery({ selectedId: "c1", managerCode: "M36" }),
    ).toBe("?conversationId=c1&manager=M36");
  });
});

describe("fetchInboxSnapshot", () => {
  it("returns a Russian error when fetch throws Failed to fetch", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchInboxSnapshot(fetchFn, "")).resolves.toEqual({
      ok: false,
      error: "Не удалось обновить ленту",
    });
  });

  it("uses the API error text on a failed response", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Менеджер не найден" }),
    });
    await expect(fetchInboxSnapshot(fetchFn, "?manager=XX")).resolves.toEqual({
      ok: false,
      error: "Менеджер не найден",
    });
  });

  it("returns the snapshot on success", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => emptySnapshot,
    });
    await expect(fetchInboxSnapshot(fetchFn, "")).resolves.toEqual({
      ok: true,
      snapshot: emptySnapshot,
    });
  });
});
