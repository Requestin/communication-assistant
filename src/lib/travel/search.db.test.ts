import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { searchTravel } from "./search";

const databaseUrl = process.env.DATABASE_URL;
const prisma = databaseUrl ? new PrismaClient() : null;

describe.skipIf(!prisma)("searchTravel invariant §12.6", () => {
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("finds MOW-LED candidates for 2 people on 1–5 Sep 2026", async () => {
    const result = await searchTravel(prisma!, {
      originCityId: "MOW",
      destCityId: "LED",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-05",
      people: 2,
      needReturn: true,
      needHotel: true,
    });

    expect(result.outbound.length).toBeGreaterThanOrEqual(3);
    expect(result.returns.length).toBeGreaterThanOrEqual(3);
    expect(result.hotels.length).toBeGreaterThanOrEqual(1);
    expect(result.outbound.every((flight) => flight.seatsLeft >= 2)).toBe(true);
    expect(result.returns.every((flight) => flight.seatsLeft >= 2)).toBe(true);
    expect(result.hotels[0]?.nights).toBe(4);
    expect(result.hotelWarning).toBeNull();
  });
});
