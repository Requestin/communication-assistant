import { describe, expect, it } from "vitest";
import { nextInboxSelection } from "./inbox-selection";

describe("nextInboxSelection", () => {
  it("keeps the open thread if it is still in the list", () => {
    expect(
      nextInboxSelection({
        selectedId: "elena",
        conversationIds: ["dmitry", "elena"],
        autoSelectFirst: false,
      }),
    ).toBe("elena");
  });

  it("keeps the open thread when the chief filters the list to another manager", () => {
    expect(
      nextInboxSelection({
        selectedId: "elena",
        conversationIds: ["dmitry-1", "dmitry-2"],
        autoSelectFirst: false,
        keepSelectedIfMissing: true,
      }),
    ).toBe("elena");
  });

  it("keeps the open thread if the filtered list is empty", () => {
    expect(
      nextInboxSelection({
        selectedId: "elena",
        conversationIds: [],
        autoSelectFirst: false,
        keepSelectedIfMissing: true,
      }),
    ).toBe("elena");
  });

  it("does not auto-open the first thread for the chief", () => {
    expect(
      nextInboxSelection({
        selectedId: null,
        conversationIds: ["dmitry-1"],
        autoSelectFirst: false,
      }),
    ).toBeNull();
  });

  it("still auto-opens the first thread for a manager with an empty selection", () => {
    expect(
      nextInboxSelection({
        selectedId: null,
        conversationIds: ["anna-1", "anna-2"],
        autoSelectFirst: true,
      }),
    ).toBe("anna-1");
  });

  it("lets a manager fall back to the first thread if the open one disappeared", () => {
    expect(
      nextInboxSelection({
        selectedId: "gone",
        conversationIds: ["anna-1"],
        autoSelectFirst: true,
      }),
    ).toBe("anna-1");
  });
});
