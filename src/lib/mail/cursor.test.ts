import { describe, expect, it } from "vitest";
import { initialLastUid } from "./cursor";

describe("initialLastUid", () => {
  it("keeps a stored cursor after restart", () => {
    expect(initialLastUid(12, 20)).toBe(12);
  });

  it("on first start backfills recent mail instead of skipping the whole inbox", () => {
    expect(initialLastUid(null, 5, 50)).toBe(0);
    expect(initialLastUid(undefined, 80, 50)).toBe(29);
  });
});
