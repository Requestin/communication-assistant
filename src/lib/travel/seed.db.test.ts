import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { DEMO_OUTBOUND_DATE, DEMO_RETURN_DATE, assertTravelInvariantsFromDb } from "./invariants";
import { seedTravel } from "./seed";

const databaseUrl = process.env.DATABASE_URL;
const prisma = databaseUrl ? new PrismaClient() : null;

describe.skipIf(!prisma)("travel seed against Postgres", () => {
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it(
    "is idempotent without --force and keeps the demo-week invariants",
    async () => {
      if (!prisma) {
        return;
      }

      const first = await seedTravel(prisma);
      const second = await seedTravel(prisma);

      expect(second.skipped).toBe(true);
      expect(second.flights).toBe(first.flights);
      expect(second.cities).toBe(22);
      expect(second.flights).toBeGreaterThanOrEqual(25_000);
      expect(second.availability).toBeGreaterThanOrEqual(40_000);

      await assertTravelInvariantsFromDb(prisma);

      const outbound = await prisma.flight.count({
        where: {
          originCityId: "MOW",
          destCityId: "LED",
          seatsLeft: { gte: 2 },
          departAt: {
            gte: new Date(`${DEMO_OUTBOUND_DATE}T00:00:00.000Z`),
            lt: new Date("2026-09-02T00:00:00.000Z"),
          },
        },
      });
      const inbound = await prisma.flight.count({
        where: {
          originCityId: "LED",
          destCityId: "MOW",
          seatsLeft: { gte: 2 },
          departAt: {
            gte: new Date(`${DEMO_RETURN_DATE}T00:00:00.000Z`),
            lt: new Date("2026-09-06T00:00:00.000Z"),
          },
        },
      });
      expect(outbound).toBeGreaterThanOrEqual(3);
      expect(inbound).toBeGreaterThanOrEqual(3);

      const ledTwinNights = await prisma.hotelAvailability.count({
        where: {
          roomType: "twin",
          roomsLeft: { gte: 1 },
          date: {
            gte: new Date("2026-09-01T00:00:00.000Z"),
            lte: new Date("2026-09-04T00:00:00.000Z"),
          },
          hotel: { cityId: "LED" },
        },
      });
      expect(ledTwinNights).toBeGreaterThanOrEqual(4);
    },
    180_000,
  );
});
