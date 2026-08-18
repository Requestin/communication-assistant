import { describe, expect, it } from "vitest";
import { replySubject } from "./smtp";

describe("replySubject", () => {
  it("adds Re: once", () => {
    expect(replySubject("Тест IMAP")).toBe("Re: Тест IMAP");
    expect(replySubject("Re: Тест IMAP")).toBe("Re: Тест IMAP");
    expect(replySubject("re: уже есть")).toBe("re: уже есть");
  });
});
