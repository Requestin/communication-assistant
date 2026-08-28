import { describe, expect, it } from "vitest";
import {
  listInboxUids,
  listSentMessageIds,
  pickSpecialMailbox,
  resolveFolders,
  searchSentUidsByMessageId,
  trashMessagesOnClient,
  type TrashImapClient,
} from "./trash";

function mockClient(partial: Partial<TrashImapClient>): TrashImapClient {
  return {
    list: async () => [],
    mailboxOpen: async () => undefined,
    search: async () => [],
    messageMove: async () => undefined,
    fetch: async function* () {
      // empty
    },
    ...partial,
  };
}

describe("pickSpecialMailbox", () => {
  it("prefers IMAP special-use over a Russian folder name", () => {
    expect(
      pickSpecialMailbox(
        [
          { path: "[Gmail]/Корзина", specialUse: false },
          { path: "[Gmail]/Bin", specialUse: "\\Trash" },
        ],
        "\\Trash",
        ["[Gmail]/Trash", "[Gmail]/Корзина"],
      ),
    ).toBe("[Gmail]/Bin");
  });

  it("falls back to a known Gmail path when special-use is missing", () => {
    expect(
      pickSpecialMailbox(
        [{ path: "[Gmail]/Sent Mail" }, { path: "INBOX" }],
        "\\Sent",
        ["[Gmail]/Sent Mail", "[Gmail]/Sent"],
      ),
    ).toBe("[Gmail]/Sent Mail");
  });

  it("is case-insensitive for special-use flags", () => {
    expect(
      pickSpecialMailbox([{ path: "Sent", specialUse: "\\sent" }], "\\Sent", [
        "[Gmail]/Sent Mail",
      ]),
    ).toBe("Sent");
  });
});

describe("resolveFolders", () => {
  it("resolves both Sent and Trash from special-use", () => {
    expect(
      resolveFolders([
        { path: "INBOX" },
        { path: "Отправленные", specialUse: "\\Sent" },
        { path: "Корзина", specialUse: "\\Trash" },
      ]),
    ).toEqual({ sent: "Отправленные", trash: "Корзина" });
  });
});

describe("listInboxUids", () => {
  it("collects UIDs from a search result", async () => {
    const uids = await listInboxUids(mockClient({ search: async () => [11, "12"] }));
    expect([...uids].sort()).toEqual(["11", "12"]);
  });

  it("asks IMAP for undeleted messages only", async () => {
    let query: object | undefined;
    await listInboxUids(
      mockClient({
        search: async (next) => {
          query = next;
          return [9];
        },
      }),
    );
    expect(query).toEqual({ deleted: false });
  });

  it("treats a false search result as an empty mailbox", async () => {
    const uids = await listInboxUids(mockClient({ search: async () => false }));
    expect(uids.size).toBe(0);
  });
});

describe("searchSentUidsByMessageId", () => {
  it("finds a UID across Message-ID variants", async () => {
    const uids = await searchSentUidsByMessageId(
      mockClient({
        search: async (query) => {
          const header = (query as { header?: string[] }).header;
          if (header?.[1] === "<out@mail.example>") {
            return [44];
          }
          return false;
        },
      }),
      "Out@mail.example",
    );
    expect(uids).toEqual([44]);
  });

  it("falls back to envelope scan when HEADER search is empty", async () => {
    const uids = await searchSentUidsByMessageId(
      mockClient({
        search: async () => [],
        fetch: async function* () {
          yield { uid: 81, envelope: { messageId: "<other@mail.example>" } };
          yield { uid: 82, envelope: { messageId: "<Out@mail.example>" } };
        },
      }),
      "<out@mail.example>",
    );
    expect(uids).toEqual([82]);
  });
});

describe("listSentMessageIds", () => {
  it("normalizes envelope Message-IDs", async () => {
    const ids = await listSentMessageIds(
      mockClient({
        fetch: async function* () {
          yield { uid: 1, envelope: { messageId: "<AbC@mail.example>" } };
        },
      }),
    );
    expect([...ids]).toEqual(["abc@mail.example"]);
  });
});

describe("trashMessagesOnClient", () => {
  it("moves a Sent copy by envelope when HEADER search finds nothing", async () => {
    const moved: Array<{ uids: number[]; dest: string }> = [];
    const opened: string[] = [];
    await trashMessagesOnClient(
      mockClient({
        list: async () => [
          { path: "INBOX" },
          { path: "[Gmail]/Sent Mail", specialUse: "\\Sent" },
          { path: "[Gmail]/Trash", specialUse: "\\Trash" },
        ],
        mailboxOpen: async (path) => {
          opened.push(path);
        },
        search: async () => [],
        fetch: async function* () {
          yield { uid: 77, envelope: { messageId: "<smtp-1@mail.example>" } };
        },
        messageMove: async (range, destination) => {
          moved.push({ uids: range as number[], dest: destination });
        },
      }),
      { inboxUids: [], smtpMessageIds: ["<SMTP-1@mail.example>"] },
    );
    expect(opened).toContain("[Gmail]/Sent Mail");
    expect(moved).toEqual([{ uids: [77], dest: "[Gmail]/Trash" }]);
  });
});
