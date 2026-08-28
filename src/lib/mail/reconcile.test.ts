import { describe, expect, it } from "vitest";
import { normalizeMessageId } from "./message-id";
import {
  affectedConversationIds,
  inboundHideIds,
  inboundRestoreIds,
  outboundHideIds,
  outboundRestoreIds,
} from "./reconcile";

const hiddenAt = new Date("2026-08-28T12:00:00.000Z");

describe("inbound UID reconcile", () => {
  const rows = [
    {
      id: "live-in",
      conversationId: "c1",
      gmailUid: "101",
      deletedAt: null,
    },
    {
      id: "gone-in",
      conversationId: "c1",
      gmailUid: "102",
      deletedAt: null,
    },
    {
      id: "hidden-in",
      conversationId: "c2",
      gmailUid: "103",
      deletedAt: hiddenAt,
    },
    {
      id: "no-uid",
      conversationId: "c3",
      gmailUid: null,
      deletedAt: null,
    },
  ];

  it("hides live inbox rows whose UID is missing", () => {
    expect(inboundHideIds(rows, new Set(["101"]))).toEqual(["gone-in"]);
  });

  it("restores hidden rows when the UID is back in INBOX", () => {
    expect(inboundRestoreIds(rows, new Set(["101", "103"]))).toEqual(["hidden-in"]);
  });

  it("does not restore a hidden row whose UID is absent from the live inbox set", () => {
    expect(inboundRestoreIds(rows, new Set(["101"]))).toEqual([]);
  });

  it("does nothing when every live UID is still present", () => {
    expect(inboundHideIds(rows, new Set(["101", "102"]))).toEqual([]);
  });
});

describe("outbound Sent Message-ID reconcile", () => {
  const rows = [
    {
      id: "live-out",
      conversationId: "c1",
      smtpMessageId: "<Live@mail.example>",
      deletedAt: null,
    },
    {
      id: "gone-out",
      conversationId: "c1",
      smtpMessageId: "<Gone@mail.example>",
      deletedAt: null,
    },
    {
      id: "hidden-out",
      conversationId: "c2",
      smtpMessageId: "hidden@mail.example",
      deletedAt: hiddenAt,
    },
    {
      id: "no-id",
      conversationId: "c3",
      smtpMessageId: null,
      deletedAt: null,
    },
  ];

  it("hides live outbound rows missing from Sent", () => {
    expect(
      outboundHideIds(rows, new Set(["live@mail.example"]), normalizeMessageId),
    ).toEqual(["gone-out"]);
  });

  it("restores hidden outbound when the Message-ID is in Sent", () => {
    expect(
      outboundRestoreIds(
        rows,
        new Set(["hidden@mail.example", "live@mail.example"]),
        normalizeMessageId,
      ),
    ).toEqual(["hidden-out"]);
  });
});

describe("affectedConversationIds", () => {
  it("returns unique conversation ids for changed messages", () => {
    expect(
      affectedConversationIds(
        [
          { id: "a", conversationId: "c1", deletedAt: null },
          { id: "b", conversationId: "c1", deletedAt: null },
          { id: "c", conversationId: "c2", deletedAt: null },
        ],
        new Set(["a", "c"]),
      ),
    ).toEqual(["c1", "c2"]);
  });
});
