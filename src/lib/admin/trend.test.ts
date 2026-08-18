import { describe, expect, it } from "vitest";
import { bucketScoreTrend } from "./trend";

describe("bucketScoreTrend", () => {
  it("keeps each reply as its own point", () => {
    const points = bucketScoreTrend(
      [
        { at: new Date("2026-08-18T10:01:00.000Z"), overall: 5 },
        { at: new Date("2026-08-18T10:20:00.000Z"), overall: 3 },
      ],
      "reply",
    );
    expect(points).toHaveLength(2);
    expect(points.map((point) => point.score)).toEqual([5, 3]);
    expect(points[0]?.label).toBe("13:01");
    expect(points[1]?.label).toBe("13:20");
  });

  it("averages two replies in the same Moscow hour", () => {
    const points = bucketScoreTrend(
      [
        { at: new Date("2026-08-18T10:01:00.000Z"), overall: 5 },
        { at: new Date("2026-08-18T10:50:00.000Z"), overall: 3 },
      ],
      "hour",
    );
    expect(points).toHaveLength(1);
    expect(points[0]?.score).toBe(4);
    expect(points[0]?.label).toBe("13:00");
  });

  it("keeps different hours apart and folds a day into one point", () => {
    const samples = [
      { at: new Date("2026-08-18T10:01:00.000Z"), overall: 5 },
      { at: new Date("2026-08-18T12:10:00.000Z"), overall: 3 },
    ];
    expect(bucketScoreTrend(samples, "hour")).toHaveLength(2);
    const days = bucketScoreTrend(samples, "day");
    expect(days).toHaveLength(1);
    expect(days[0]?.score).toBe(4);
    expect(days[0]?.label).toBe("18.08");
  });

  it("buckets by Moscow calendar day, not UTC", () => {
    const points = bucketScoreTrend(
      [{ at: new Date("2026-08-17T21:30:00.000Z"), overall: 5 }],
      "day",
    );
    expect(points[0]?.key).toBe("2026-08-18");
    expect(points[0]?.label).toBe("18.08");
  });

  it("adds the calendar day to labels when samples span two days", () => {
    const points = bucketScoreTrend(
      [
        { at: new Date("2026-08-18T10:01:00.000Z"), overall: 5 },
        { at: new Date("2026-08-19T10:01:00.000Z"), overall: 4 },
      ],
      "reply",
    );
    expect(points[0]?.label).toBe("18.08 13:01");
    expect(points[1]?.label).toBe("19.08 13:01");
  });
});
