import { describe, expect, it } from "vitest";
import { conversationThreadKey } from "./thread-key";

describe("conversationThreadKey", () => {
  it("treats Re/Fwd prefixes as the same thread", () => {
    expect(conversationThreadKey("Тест IMAP")).toBe("тест imap");
    expect(conversationThreadKey("Re: Тест IMAP")).toBe("тест imap");
    expect(conversationThreadKey("RE: Re: Тест IMAP")).toBe("тест imap");
    expect(conversationThreadKey("Fwd: Тест IMAP")).toBe("тест imap");
  });

  it("keeps a different subject as a different thread", () => {
    expect(conversationThreadKey("Командировка Томск")).toBe("командировка томск");
    expect(conversationThreadKey("Командировка Томск")).not.toBe(
      conversationThreadKey("Тест IMAP"),
    );
  });

  it("falls back when the subject is empty", () => {
    expect(conversationThreadKey("   ")).toBe("(без темы)");
  });
});
