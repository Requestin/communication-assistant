import { describe, expect, it } from "vitest";
import { CITIES } from "./cities";
import { CATALOG_END, CATALOG_START, parseIsoDate, toIsoDate } from "./dates";
import { generateTravelCatalog, type TravelCatalog } from "./generate";
import { assertGeneratedCatalog, collectTravelInvariantErrors } from "./invariants";
import { hotelNights } from "./price";
import { TRAVEL_SEED } from "./prng";
import { pickBestHotelStay, type HotelNightInventory } from "./search";

function shiftIso(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

function inventoryByHotel(catalog: TravelCatalog): Map<string, HotelNightInventory> {
  const map = new Map<string, HotelNightInventory>();
  for (const hotel of catalog.hotels) {
    map.set(hotel.id, new Map());
  }
  for (const row of catalog.availability) {
    const byNight = map.get(row.hotelId);
    if (!byNight) {
      continue;
    }
    const key = row.date.toISOString().slice(0, 10);
    const slot = byNight.get(key) ?? {};
    slot[row.roomType] = { roomsLeft: row.roomsLeft, pricePerNightRub: row.pricePerNightRub };
    byNight.set(key, slot);
  }
  return map;
}

function cityHasStay(
  catalog: TravelCatalog,
  inventories: Map<string, HotelNightInventory>,
  cityId: string,
  nights: string[],
  people: number,
): boolean {
  return catalog.hotels.some((hotel) => {
    if (hotel.cityId !== cityId) {
      return false;
    }
    const byNight = inventories.get(hotel.id);
    return Boolean(byNight && pickBestHotelStay(nights, byNight, people, hotel));
  });
}

function findSoldOutWindow(
  catalog: TravelCatalog,
  stayNights: number,
): { cityId: string; dateFrom: string; dateTo: string; people: number } | null {
  const inventories = inventoryByHotel(catalog);
  const lastStart = shiftIso(CATALOG_END, -(stayNights - 1));
  for (const people of [1, 2]) {
    for (const city of CITIES) {
      for (let start = CATALOG_START; start <= lastStart; start = shiftIso(start, 7)) {
        const dateTo = shiftIso(start, stayNights);
        const nights = hotelNights(start, dateTo);
        if (nights.length !== stayNights) {
          continue;
        }
        if (!cityHasStay(catalog, inventories, city.id, nights, people)) {
          return { cityId: city.id, dateFrom: start, dateTo, people };
        }
      }
    }
  }
  return null;
}

describe("travel catalog generator", () => {
  it("is deterministic for the same PRNG seed", () => {
    const first = generateTravelCatalog(TRAVEL_SEED);
    const second = generateTravelCatalog(TRAVEL_SEED);

    expect(first.flights).toHaveLength(second.flights.length);
    expect(first.flights[0]?.flightNo).toBe(second.flights[0]?.flightNo);
    expect(first.flights[0]?.priceRub).toBe(second.flights[0]?.priceRub);
    expect(first.flights.at(-1)?.flightNo).toBe(second.flights.at(-1)?.flightNo);
    expect(first.flights.at(-1)?.priceRub).toBe(second.flights.at(-1)?.priceRub);
  });

  it("satisfies the Moscow–Petersburg demo invariants", () => {
    const catalog = generateTravelCatalog();
    expect(collectTravelInvariantErrors(catalog)).toEqual([]);
    assertGeneratedCatalog(catalog);
    expect(catalog.cities).toHaveLength(22);
    expect(catalog.hotels.length).toBeGreaterThanOrEqual(154);
    expect(catalog.hotels.length).toBeLessThanOrEqual(176);
    expect(catalog.hotels.every((hotel) => hotel.name.length > 0)).toBe(true);
  });

  it("still has at least one 10-night window without rooms", () => {
    const catalog = generateTravelCatalog();
    expect(findSoldOutWindow(catalog, 10)).not.toBeNull();
  });
});
