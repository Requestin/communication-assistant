import type { PrismaClient } from "@prisma/client";
import { isoDateOf, parseIsoDate } from "./dates";
import { hotelNights, hotelStayCost, roomsForStay, type RoomTypeChoice } from "./price";

const CANDIDATE_LIMIT = 8;

export type FlightCandidate = {
  id: string;
  flightNo: string;
  airline: string;
  originCityId: string;
  destCityId: string;
  departAt: string;
  arriveAt: string;
  priceRub: number;
  seatsLeft: number;
  dateShiftDays: number;
};

export type HotelCandidate = {
  id: string;
  name: string;
  stars: number;
  roomType: RoomTypeChoice;
  rooms: number;
  nights: number;
  stayCostRub: number;
  nightPrices: number[];
};

export type RoomNightOffer = {
  roomsLeft: number;
  pricePerNightRub: number;
};

export type HotelNightInventory = Map<
  string,
  { standard?: RoomNightOffer; twin?: RoomNightOffer }
>;

export function pickBestHotelStay(
  nights: string[],
  byNight: HotelNightInventory,
  people: number,
  hotel: { id: string; name: string; stars: number },
): HotelCandidate | null {
  if (nights.length === 0) {
    return null;
  }

  const guests = Math.max(1, people);
  const options: HotelCandidate[] = [];
  for (const roomType of ["standard", "twin"] as const) {
    const rooms = roomsForStay(guests, roomType);
    const rows = nights.map((night) => byNight.get(night)?.[roomType]);
    if (!rows.every((row) => row && row.roomsLeft >= rooms)) {
      continue;
    }
    const nightPrices = rows.map((row) => row!.pricePerNightRub);
    options.push({
      id: hotel.id,
      name: hotel.name,
      stars: hotel.stars,
      roomType,
      rooms,
      nights: nights.length,
      stayCostRub: hotelStayCost(nightPrices, rooms),
      nightPrices,
    });
  }

  return options.sort((a, b) => a.stayCostRub - b.stayCostRub)[0] ?? null;
}

export type TravelSearchQuery = {
  originCityId: string;
  destCityId: string;
  dateFrom: string;
  dateTo: string | null;
  people: number;
  needReturn: boolean;
  needHotel: boolean;
};

export type TravelSearchResult = {
  outbound: FlightCandidate[];
  returns: FlightCandidate[];
  hotels: HotelCandidate[];
  nearestDates: boolean;
  hotelWarning: string | null;
};

function dayWindow(iso: string): { start: Date; end: Date } {
  const start = parseIsoDate(iso);
  const end = parseIsoDate(iso);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function shiftIso(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDateOf(date);
}

async function findFlightsOnDate(
  prisma: PrismaClient,
  originCityId: string,
  destCityId: string,
  isoDate: string,
  people: number,
  dateShiftDays: number,
): Promise<FlightCandidate[]> {
  const { start, end } = dayWindow(isoDate);
  const rows = await prisma.flight.findMany({
    where: {
      originCityId,
      destCityId,
      seatsLeft: { gte: people },
      departAt: { gte: start, lt: end },
    },
    orderBy: { priceRub: "asc" },
    take: CANDIDATE_LIMIT,
  });
  return rows.map((row) => ({
    id: row.id,
    flightNo: row.flightNo,
    airline: row.airline,
    originCityId: row.originCityId,
    destCityId: row.destCityId,
    departAt: row.departAt.toISOString(),
    arriveAt: row.arriveAt.toISOString(),
    priceRub: row.priceRub,
    seatsLeft: row.seatsLeft,
    dateShiftDays,
  }));
}

async function searchFlights(
  prisma: PrismaClient,
  originCityId: string,
  destCityId: string,
  isoDate: string,
  people: number,
): Promise<{ flights: FlightCandidate[]; nearestDates: boolean }> {
  const exact = await findFlightsOnDate(prisma, originCityId, destCityId, isoDate, people, 0);
  if (exact.length > 0) {
    return { flights: exact, nearestDates: false };
  }

  const nearby = (
    await Promise.all([
      findFlightsOnDate(prisma, originCityId, destCityId, shiftIso(isoDate, -1), people, -1),
      findFlightsOnDate(prisma, originCityId, destCityId, shiftIso(isoDate, 1), people, 1),
    ])
  )
    .flat()
    .sort((a, b) => a.priceRub - b.priceRub)
    .slice(0, CANDIDATE_LIMIT);

  return { flights: nearby, nearestDates: nearby.length > 0 };
}

export async function searchTravel(
  prisma: PrismaClient,
  query: TravelSearchQuery,
): Promise<TravelSearchResult> {
  const people = Math.max(1, query.people);
  const outboundSearch = await searchFlights(
    prisma,
    query.originCityId,
    query.destCityId,
    query.dateFrom,
    people,
  );

  let returns: FlightCandidate[] = [];
  let returnNearest = false;
  if (query.needReturn && query.dateTo) {
    const inbound = await searchFlights(
      prisma,
      query.destCityId,
      query.originCityId,
      query.dateTo,
      people,
    );
    returns = inbound.flights;
    returnNearest = inbound.nearestDates;
  }

  let hotels: HotelCandidate[] = [];
  let hotelWarning: string | null = null;
  if (query.needHotel) {
    if (!query.dateTo) {
      hotelWarning = "Нет даты окончания — отель не ищем.";
    } else {
      const nights = hotelNights(query.dateFrom, query.dateTo);
      if (nights.length === 0) {
        hotelWarning = "Нет ночей для проживания.";
      } else {
        hotels = await searchHotels(prisma, query.destCityId, nights, people);
        if (hotels.length === 0) {
          hotelWarning = "На эти ночи нет номеров.";
        }
      }
    }
  }

  return {
    outbound: outboundSearch.flights,
    returns,
    hotels,
    nearestDates: outboundSearch.nearestDates || returnNearest,
    hotelWarning,
  };
}

async function searchHotels(
  prisma: PrismaClient,
  destCityId: string,
  nights: string[],
  people: number,
): Promise<HotelCandidate[]> {
  const nightStart = parseIsoDate(nights[0]!);
  const nightEnd = parseIsoDate(nights[nights.length - 1]!);
  const hotels = await prisma.hotel.findMany({
    where: { cityId: destCityId },
    include: {
      availability: {
        where: { date: { gte: nightStart, lte: nightEnd } },
      },
    },
  });

  const candidates: HotelCandidate[] = [];
  for (const hotel of hotels) {
    const byNight: HotelNightInventory = new Map();
    for (const row of hotel.availability) {
      const key = isoDateOf(row.date);
      const slot = byNight.get(key) ?? {};
      slot[row.roomType] = { roomsLeft: row.roomsLeft, pricePerNightRub: row.pricePerNightRub };
      byNight.set(key, slot);
    }

    const best = pickBestHotelStay(nights, byNight, people, hotel);
    if (best) {
      candidates.push(best);
    }
  }

  return candidates.sort((a, b) => a.stayCostRub - b.stayCostRub).slice(0, CANDIDATE_LIMIT);
}
