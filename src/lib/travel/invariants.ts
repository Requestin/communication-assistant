import type { PrismaClient } from "@prisma/client";
import { isoDateOf } from "./dates";
import type { TravelCatalog } from "./generate";

export const DEMO_OUTBOUND_DATE = "2026-09-01";
export const DEMO_RETURN_DATE = "2026-09-05";
export const DEMO_HOTEL_NIGHTS = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"] as const;

export type InvariantFlight = {
  originCityId: string;
  destCityId: string;
  departAt: Date;
  seatsLeft: number;
};

export type InvariantHotel = {
  id: string;
  cityId: string;
};

export type InvariantAvailability = {
  hotelId: string;
  date: Date;
  roomType: "standard" | "twin";
  roomsLeft: number;
};

export type TravelInvariantInput = {
  flights: InvariantFlight[];
  hotels: InvariantHotel[];
  availability: InvariantAvailability[];
};

function flightsOnDate(
  flights: InvariantFlight[],
  origin: string,
  dest: string,
  isoDate: string,
): InvariantFlight[] {
  return flights.filter(
    (flight) =>
      flight.originCityId === origin &&
      flight.destCityId === dest &&
      isoDateOf(flight.departAt) === isoDate,
  );
}

function hotelHasRooms(
  availability: InvariantAvailability[],
  hotelId: string,
  night: string,
  roomType: "standard" | "twin",
  minRooms: number,
): boolean {
  return availability.some(
    (row) =>
      row.hotelId === hotelId &&
      row.roomType === roomType &&
      isoDateOf(row.date) === night &&
      row.roomsLeft >= minRooms,
  );
}

export function collectTravelInvariantErrors(input: TravelInvariantInput): string[] {
  const errors: string[] = [];

  const outbound = flightsOnDate(input.flights, "MOW", "LED", DEMO_OUTBOUND_DATE);
  const outboundOk = outbound.filter((flight) => flight.seatsLeft >= 2);
  if (outboundOk.length < 3) {
    errors.push(
      `MOW→LED ${DEMO_OUTBOUND_DATE}: нужно ≥3 рейса с seatsLeft≥2, есть ${outboundOk.length}`,
    );
  }

  const inbound = flightsOnDate(input.flights, "LED", "MOW", DEMO_RETURN_DATE);
  const inboundOk = inbound.filter((flight) => flight.seatsLeft >= 2);
  if (inboundOk.length < 3) {
    errors.push(
      `LED→MOW ${DEMO_RETURN_DATE}: нужно ≥3 рейса с seatsLeft≥2, есть ${inboundOk.length}`,
    );
  }

  for (const cityId of ["MOW", "LED"]) {
    const cityHotels = input.hotels.filter((hotel) => hotel.cityId === cityId);
    const okHotel = cityHotels.find((hotel) =>
      DEMO_HOTEL_NIGHTS.every(
        (night) =>
          hotelHasRooms(input.availability, hotel.id, night, "twin", 1) &&
          hotelHasRooms(input.availability, hotel.id, night, "standard", 2),
      ),
    );
    if (!okHotel) {
      errors.push(
        `${cityId}: нет отеля с twin≥1 и standard≥2 на ночи 2026-09-01…2026-09-04`,
      );
    }
  }

  const ledHotels = input.hotels.filter((hotel) => hotel.cityId === "LED");
  const ledTwin = ledHotels.find((hotel) =>
    DEMO_HOTEL_NIGHTS.every((night) =>
      hotelHasRooms(input.availability, hotel.id, night, "twin", 1),
    ),
  );
  if (!ledTwin) {
    errors.push("LED: нет отеля с twin.roomsLeft≥1 на ночи 01–04.09.2026");
  }

  return errors;
}

export function assertTravelInvariants(input: TravelInvariantInput): void {
  const errors = collectTravelInvariantErrors(input);
  if (errors.length > 0) {
    throw new Error(`Инварианты справочника не выполнены:\n${errors.join("\n")}`);
  }
}

export function assertGeneratedCatalog(catalog: TravelCatalog): void {
  assertTravelInvariants(catalog);
}

export async function loadTravelInvariantInput(
  prisma: PrismaClient,
): Promise<TravelInvariantInput> {
  const outboundStart = new Date(`${DEMO_OUTBOUND_DATE}T00:00:00.000Z`);
  const outboundEnd = new Date(`${DEMO_OUTBOUND_DATE}T00:00:00.000Z`);
  outboundEnd.setUTCDate(outboundEnd.getUTCDate() + 1);

  const returnStart = new Date(`${DEMO_RETURN_DATE}T00:00:00.000Z`);
  const returnEnd = new Date(`${DEMO_RETURN_DATE}T00:00:00.000Z`);
  returnEnd.setUTCDate(returnEnd.getUTCDate() + 1);

  const hotelFrom = new Date(`${DEMO_HOTEL_NIGHTS[0]}T00:00:00.000Z`);
  const hotelTo = new Date(`${DEMO_HOTEL_NIGHTS[DEMO_HOTEL_NIGHTS.length - 1]}T00:00:00.000Z`);

  const [flights, hotels] = await Promise.all([
    prisma.flight.findMany({
      where: {
        OR: [
          {
            originCityId: "MOW",
            destCityId: "LED",
            departAt: { gte: outboundStart, lt: outboundEnd },
          },
          {
            originCityId: "LED",
            destCityId: "MOW",
            departAt: { gte: returnStart, lt: returnEnd },
          },
        ],
      },
      select: {
        originCityId: true,
        destCityId: true,
        departAt: true,
        seatsLeft: true,
      },
    }),
    prisma.hotel.findMany({
      where: { cityId: { in: ["MOW", "LED"] } },
      select: {
        id: true,
        cityId: true,
        availability: {
          where: {
            date: { gte: hotelFrom, lte: hotelTo },
          },
          select: {
            hotelId: true,
            date: true,
            roomType: true,
            roomsLeft: true,
          },
        },
      },
    }),
  ]);

  return {
    flights,
    hotels: hotels.map((hotel) => ({ id: hotel.id, cityId: hotel.cityId })),
    availability: hotels.flatMap((hotel) => hotel.availability),
  };
}

export async function assertTravelInvariantsFromDb(prisma: PrismaClient): Promise<void> {
  assertTravelInvariants(await loadTravelInvariantInput(prisma));
}
