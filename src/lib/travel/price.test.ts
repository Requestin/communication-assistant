import { describe, expect, it } from "vitest";
import { hotelNights, hotelStayCost, packageTotalRub, roomsForStay } from "./price";

describe("hotelNights", () => {
  it("counts nights as [dateFrom, dateTo)", () => {
    expect(hotelNights("2026-09-01", "2026-09-05")).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
  });

  it("returns no nights when dates are the same day", () => {
    expect(hotelNights("2026-09-01", "2026-09-01")).toEqual([]);
  });
});

describe("packageTotalRub", () => {
  it("adds flights times people plus hotel nights", () => {
    const hotel = hotelStayCost([4000, 4000, 4000, 4000], roomsForStay(2, "twin"));
    expect(hotel).toBe(16000);
    expect(
      packageTotalRub({
        outboundPriceRub: 5000,
        returnPriceRub: 6000,
        hotelCostRub: hotel,
        people: 2,
      }),
    ).toBe(5000 * 2 + 6000 * 2 + 16000);
  });

  it("matches the Petersburg demo: two seats plus hotel stay", () => {
    expect(
      packageTotalRub({
        outboundPriceRub: 6900,
        returnPriceRub: 7900,
        hotelCostRub: 39500,
        people: 2,
      }),
    ).toBe(69100);
  });
});
