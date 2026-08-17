import type { PrismaClient } from "@prisma/client";
import { generateTravelCatalog } from "./generate";
import { assertTravelInvariantsFromDb } from "./invariants";

const BATCH_SIZE = 1000;

export type SeedTravelOptions = {
  force?: boolean;
};

export type SeedTravelResult = {
  skipped: boolean;
  cities: number;
  hotels: number;
  flights: number;
  availability: number;
};

async function createManyInBatches<T extends object>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    await insert(rows.slice(index, index + BATCH_SIZE));
  }
}

async function currentCounts(prisma: PrismaClient): Promise<Omit<SeedTravelResult, "skipped">> {
  const [cities, hotels, flights, availability] = await Promise.all([
    prisma.city.count(),
    prisma.hotel.count(),
    prisma.flight.count(),
    prisma.hotelAvailability.count(),
  ]);
  return { cities, hotels, flights, availability };
}

export async function seedTravel(
  prisma: PrismaClient,
  options: SeedTravelOptions = {},
): Promise<SeedTravelResult> {
  const existingFlights = await prisma.flight.count();
  if (existingFlights > 0 && !options.force) {
    return { skipped: true, ...(await currentCounts(prisma)) };
  }

  if (options.force) {
    await prisma.$transaction(
      async (tx) => {
        await tx.hotelAvailability.deleteMany();
        await tx.hotel.deleteMany();
        await tx.flight.deleteMany();
        await tx.city.deleteMany();
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
  }

  const catalog = generateTravelCatalog();

  await prisma.city.createMany({
    data: catalog.cities.map((city) => ({
      id: city.id,
      name: city.name,
      iataCity: city.iataCity,
      timezone: city.timezone,
      aliases: city.aliases,
      tier: city.tier,
    })),
  });

  await createManyInBatches(catalog.hotels, (data) => prisma.hotel.createMany({ data }));
  await createManyInBatches(catalog.availability, (data) =>
    prisma.hotelAvailability.createMany({ data }),
  );
  await createManyInBatches(catalog.flights, (data) => prisma.flight.createMany({ data }));

  await assertTravelInvariantsFromDb(prisma);

  return { skipped: false, ...(await currentCounts(prisma)) };
}
