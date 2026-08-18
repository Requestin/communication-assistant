import { describe, expect, it } from "vitest";
import { isNearBottom, scrollToEnd } from "./inbox-scroll";

describe("isNearBottom", () => {
  it("is true at the very bottom", () => {
    expect(
      isNearBottom({ scrollTop: 400, clientHeight: 200, scrollHeight: 600 }),
    ).toBe(true);
  });

  it("is true within the threshold", () => {
    expect(
      isNearBottom({ scrollTop: 340, clientHeight: 200, scrollHeight: 600 }, 80),
    ).toBe(true);
  });

  it("is false when reading history above the threshold", () => {
    expect(
      isNearBottom({ scrollTop: 100, clientHeight: 200, scrollHeight: 600 }, 80),
    ).toBe(false);
  });
});

describe("scrollToEnd", () => {
  it("sets scrollTop to scrollHeight", () => {
    const el = { scrollTop: 0, scrollHeight: 840 };
    scrollToEnd(el);
    expect(el.scrollTop).toBe(840);
  });
});
