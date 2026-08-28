import { describe, expect, it } from "vitest";
import { messageIdVariants, normalizeMessageId } from "./message-id";

describe("normalizeMessageId", () => {
  it("strips brackets and lowercases", () => {
    expect(normalizeMessageId(" <ABC@mail.example> ")).toBe("abc@mail.example");
    expect(normalizeMessageId("abc@mail.example")).toBe("abc@mail.example");
  });
});

describe("messageIdVariants", () => {
  it("searches both raw and bracketed forms", () => {
    expect(messageIdVariants("<ABC@mail.example>")).toEqual([
      "<ABC@mail.example>",
      "abc@mail.example",
      "<abc@mail.example>",
    ]);
  });
});
