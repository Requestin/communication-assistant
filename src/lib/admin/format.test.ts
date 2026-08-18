import { describe, expect, it } from "vitest";
import { formatHintRate, formatScore } from "./format";

describe("admin formatters", () => {
  it("shows a dash without a score and percents for hint rate", () => {
    expect(formatScore(null)).toBe("—");
    expect(formatScore(4)).toMatch(/4[,.]0/);
    expect(formatHintRate(0.5)).toBe("50%");
    expect(formatHintRate(0)).toBe("0%");
  });
});
