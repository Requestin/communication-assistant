import { describe, expect, it } from "vitest";
import { generateTravelCatalog } from "./generate";
import { assertGeneratedCatalog, collectTravelInvariantErrors } from "./invariants";
import { TRAVEL_SEED } from "./prng";

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
    expect(catalog.hotels.length).toBeGreaterThanOrEqual(66);
    expect(catalog.hotels.length).toBeLessThanOrEqual(88);
  });
});
