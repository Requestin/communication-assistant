import { describe, expect, it } from "vitest";
import { CITIES, CITY_IDS } from "./cities";

const EXPECTED_IDS = [
  "MOW",
  "LED",
  "OVB",
  "SVX",
  "KZN",
  "GOJ",
  "CEK",
  "KUF",
  "OMS",
  "ROV",
  "UFA",
  "KJA",
  "VOZ",
  "PEE",
  "VOG",
  "KRR",
  "TJM",
  "IKT",
  "KHV",
  "VVO",
  "KGD",
  "AER",
];

describe("travel cities", () => {
  it("contains exactly the 22 hubs from §12.2", () => {
    expect(CITIES).toHaveLength(22);
    expect([...CITY_IDS].sort()).toEqual([...EXPECTED_IDS].sort());
  });

  it("keeps spoken aliases for Moscow, Petersburg and Vladivostok", () => {
    const aliases = CITIES.flatMap((city) => city.aliases);
    expect(aliases).toContain("питер");
    expect(aliases).toContain("мск");
    expect(aliases).toContain("владик");
  });
});
