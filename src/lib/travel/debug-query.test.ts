import { describe, expect, it } from "vitest";
import { parseDebugFlightsQuery } from "./debug-query";

describe("parseDebugFlightsQuery", () => {
  it("accepts a valid Moscow–Petersburg query", () => {
    const parsed = parseDebugFlightsQuery(
      new URLSearchParams("from=MOW&to=LED&date=2026-09-01"),
    );
    expect(parsed).toEqual({
      ok: true,
      query: { from: "MOW", to: "LED", date: "2026-09-01" },
    });
  });

  it("rejects an unknown city and an impossible date", () => {
    expect(parseDebugFlightsQuery(new URLSearchParams("from=XXX&to=LED&date=2026-09-01")).ok).toBe(
      false,
    );
    expect(parseDebugFlightsQuery(new URLSearchParams("from=MOW&to=LED&date=2026-13-40")).ok).toBe(
      false,
    );
  });
});
