import { describe, expect, it } from "vitest";
import { averageOverall, hintRate, roundScore } from "./stats";

describe("admin score formulas §10.3", () => {
  it("averages Anna 5 and 3 to 4.0 and Dmitry's single 4 stays 4", () => {
    expect(averageOverall([5, 3])).toBe(4);
    expect(averageOverall([4])).toBe(4);
    expect(averageOverall([])).toBeNull();
  });

  it("computes hint rate as COUNT(showHint)/COUNT(scores), never NaN", () => {
    expect(hintRate(1, 2)).toBe(0.5);
    expect(hintRate(0, 1)).toBe(0);
    expect(hintRate(0, 0)).toBe(0);
  });

  it("rounds department averages to one decimal like quality overall", () => {
    expect(roundScore(3.66)).toBe(3.7);
    expect(averageOverall([5, 4, 3])).toBe(4);
  });
});
