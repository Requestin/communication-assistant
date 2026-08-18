import { describe, expect, it } from "vitest";
import { pickBestHotelStay, type HotelNightInventory } from "./search";

const hotel = { id: "LED-H1", name: "Тестовый", stars: 4 };

function inventory(
  nights: Array<[string, { standard: number; twin: number; stdPrice?: number; twinPrice?: number }]>,
): HotelNightInventory {
  const byNight: HotelNightInventory = new Map();
  for (const [date, slot] of nights) {
    byNight.set(date, {
      standard: { roomsLeft: slot.standard, pricePerNightRub: slot.stdPrice ?? 4000 },
      twin: { roomsLeft: slot.twin, pricePerNightRub: slot.twinPrice ?? 5800 },
    });
  }
  return byNight;
}

const threeNights = ["2026-11-12", "2026-11-13", "2026-11-14"] as const;

describe("pickBestHotelStay", () => {
  it("gives a solo traveller twin when standard has a hole", () => {
    const byNight = inventory([
      ["2026-11-12", { standard: 0, twin: 4 }],
      ["2026-11-13", { standard: 3, twin: 6 }],
      ["2026-11-14", { standard: 2, twin: 3 }],
    ]);
    const pick = pickBestHotelStay([...threeNights], byNight, 1, hotel);
    expect(pick?.roomType).toBe("twin");
    expect(pick?.rooms).toBe(1);
    expect(pick?.stayCostRub).toBe(5800 * 3);
  });

  it("prefers standard for one person when both types cover every night", () => {
    const byNight = inventory([
      ["2026-11-12", { standard: 2, twin: 4 }],
      ["2026-11-13", { standard: 3, twin: 6 }],
      ["2026-11-14", { standard: 2, twin: 3 }],
    ]);
    const pick = pickBestHotelStay([...threeNights], byNight, 1, hotel);
    expect(pick?.roomType).toBe("standard");
    expect(pick?.rooms).toBe(1);
    expect(pick?.stayCostRub).toBe(4000 * 3);
  });

  it("returns null when both types have a hole for one person", () => {
    const byNight = inventory([
      ["2026-11-12", { standard: 0, twin: 4 }],
      ["2026-11-13", { standard: 3, twin: 0 }],
      ["2026-11-14", { standard: 2, twin: 3 }],
    ]);
    expect(pickBestHotelStay([...threeNights], byNight, 1, hotel)).toBeNull();
  });

  it("keeps two people on twin or two standard, whichever is cheaper", () => {
    const twinCheaper = inventory([
      ["2026-11-12", { standard: 2, twin: 1 }],
      ["2026-11-13", { standard: 2, twin: 1 }],
      ["2026-11-14", { standard: 2, twin: 1 }],
    ]);
    expect(pickBestHotelStay([...threeNights], twinCheaper, 2, hotel)?.roomType).toBe("twin");
    expect(pickBestHotelStay([...threeNights], twinCheaper, 2, hotel)?.rooms).toBe(1);

    const onlyStandard = inventory([
      ["2026-11-12", { standard: 2, twin: 0 }],
      ["2026-11-13", { standard: 2, twin: 1 }],
      ["2026-11-14", { standard: 2, twin: 1 }],
    ]);
    const pick = pickBestHotelStay([...threeNights], onlyStandard, 2, hotel);
    expect(pick?.roomType).toBe("standard");
    expect(pick?.rooms).toBe(2);
  });
});
