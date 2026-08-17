import { CITIES, type CitySeed } from "./cities";
import { CATALOG_END, CATALOG_START, eachIsoDate, wallDateTime, weekdayUtc } from "./dates";
import { hash32, mulberry32, randFloat, randInt, TRAVEL_SEED } from "./prng";
import { buildRoutes, unorderedPair } from "./routes";

export type GeneratedFlight = {
  id: string;
  flightNo: string;
  airline: string;
  originCityId: string;
  destCityId: string;
  departAt: Date;
  arriveAt: Date;
  priceRub: number;
  seatsLeft: number;
};

export type GeneratedHotel = {
  id: string;
  cityId: string;
  name: string;
  stars: number;
};

export type GeneratedAvailability = {
  id: string;
  hotelId: string;
  date: Date;
  roomType: "standard" | "twin";
  roomsLeft: number;
  pricePerNightRub: number;
};

export type TravelCatalog = {
  cities: CitySeed[];
  flights: GeneratedFlight[];
  hotels: GeneratedHotel[];
  availability: GeneratedAvailability[];
};

const SLOT_MINUTES = [
  [6, 30],
  [9, 10],
  [13, 40],
  [18, 20],
  [21, 5],
] as const;

const AIRLINES = [
  { code: "SU", name: "Аэрофлот" },
  { code: "S7", name: "S7" },
  { code: "DP", name: "Победа" },
  { code: "U6", name: "Уральские авиалинии" },
] as const;

const SHORT_PAIRS = new Set([
  "LED-MOW",
  "GOJ-MOW",
  "KZN-MOW",
  "MOW-VOZ",
  "GOJ-LED",
  "GOJ-KZN",
  "AER-KRR",
  "KRR-ROV",
]);

const MEDIUM_PAIRS = new Set([
  "MOW-SVX",
  "KRR-MOW",
  "AER-MOW",
  "MOW-ROV",
  "KZN-LED",
  "AER-LED",
]);

const LONG_PAIRS = new Set(["MOW-OVB", "KJA-MOW", "IKT-MOW", "LED-OVB"]);

const VERY_LONG_PAIRS = new Set(["MOW-VVO", "KHV-MOW", "LED-VVO"]);

const FAR_EAST = new Set(["VVO", "KHV"]);
const SIBERIA = new Set(["OVB", "KJA", "IKT"]);
const HOTEL_TEMPLATES = [
  (city: string) => `Гостиница Невский 38, ${city}`,
  (city: string) => `Отель Река, ${city}`,
  (city: string) => `Аврора Plaza ${city}`,
  (city: string) => `Сибирский двор, ${city}`,
  (city: string) => `Тихий центр, ${city}`,
];

type Band = "short" | "medium" | "long" | "veryLong" | "kgdWest";

function pairKey(a: string, b: string): string {
  return unorderedPair(a, b);
}

function durationBand(origin: string, dest: string): Band {
  const pair = pairKey(origin, dest);
  if (
    (origin === "KGD" && (dest === "MOW" || dest === "LED")) ||
    (dest === "KGD" && (origin === "MOW" || origin === "LED"))
  ) {
    return "kgdWest";
  }
  if (SHORT_PAIRS.has(pair)) {
    return "short";
  }
  if (MEDIUM_PAIRS.has(pair)) {
    return "medium";
  }
  if (LONG_PAIRS.has(pair)) {
    return "long";
  }
  if (VERY_LONG_PAIRS.has(pair)) {
    return "veryLong";
  }
  if (FAR_EAST.has(origin) || FAR_EAST.has(dest)) {
    return origin === dest || (FAR_EAST.has(origin) && FAR_EAST.has(dest))
      ? "short"
      : "veryLong";
  }
  if (SIBERIA.has(origin) || SIBERIA.has(dest)) {
    return "long";
  }
  return "medium";
}

function durationMinutes(band: Band, salt: number): number {
  const ranges: Record<Band, [number, number]> = {
    short: [75, 120],
    medium: [120, 210],
    long: [210, 360],
    veryLong: [420, 570],
    kgdWest: [120, 150],
  };
  const [min, max] = ranges[band];
  return min + (salt % (max - min + 1));
}

function pickAirline(origin: string, dest: string, salt: number) {
  const far = FAR_EAST.has(origin) || FAR_EAST.has(dest) || SIBERIA.has(origin) || SIBERIA.has(dest);
  const band = durationBand(origin, dest);
  if (far) {
    return salt % 2 === 0 ? AIRLINES[0] : AIRLINES[1];
  }
  if (band === "short") {
    return salt % 3 === 0 ? AIRLINES[2] : AIRLINES[salt % 4];
  }
  return AIRLINES[salt % 4];
}

function basePrice(band: Band, salt: number): number {
  const ranges: Record<Band, [number, number]> = {
    short: [6500, 14000],
    medium: [11000, 24000],
    kgdWest: [13000, 26000],
    long: [16000, 36000],
    veryLong: [24000, 52000],
  };
  const [min, max] = ranges[band];
  return min + (salt % (max - min + 1));
}

function priceForFlight(
  origin: string,
  dest: string,
  isoDate: string,
  airlineCode: string,
  salt: number,
  rng: () => number,
): number {
  const band = durationBand(origin, dest);
  let price = basePrice(band, salt);
  const weekday = weekdayUtc(isoDate);
  if (weekday === 0 || weekday === 5) {
    price *= 1.12;
  }
  if ((origin === "AER" || dest === "AER") && (isoDate.startsWith("2026-08") || isoDate.startsWith("2026-09"))) {
    price *= 1.18;
  }
  if (isoDate >= "2026-12-20") {
    price *= 1.15;
  }
  if (airlineCode === "DP") {
    price *= 0.78;
  }
  if (airlineCode === "SU") {
    price *= 1.08;
  }
  price *= randFloat(rng, 0.92, 1.08);
  return Math.max(3500, Math.round(price / 100) * 100);
}

function standardNightPrice(tier: 1 | 2 | 3, stars: number): number {
  const table: Record<1 | 2 | 3, Record<number, number>> = {
    1: { 3: 6500, 4: 9800, 5: 16000 },
    2: { 3: 4800, 4: 7200, 5: 12000 },
    3: { 3: 3900, 4: 5800, 5: 9500 },
  };
  return table[tier][stars] ?? table[tier][4];
}

function generateFlights(rng: () => number): GeneratedFlight[] {
  const flights: GeneratedFlight[] = [];
  const dates = eachIsoDate(CATALOG_START, CATALOG_END);

  for (const route of buildRoutes()) {
    for (const isoDate of dates) {
      for (let slot = 0; slot < route.flightsPerDay; slot += 1) {
        const key = `${route.origin}-${route.dest}-${isoDate}-${slot}`;
        const salt = hash32(key);
        const airline = pickAirline(route.origin, route.dest, salt);
        const [baseHour, baseMinute] = SLOT_MINUTES[slot];
        const shift = salt % 25;
        const depart = wallDateTime(isoDate, baseHour, baseMinute + shift);
        const minutes = durationMinutes(durationBand(route.origin, route.dest), salt);
        const arrive = new Date(depart.getTime() + minutes * 60_000);
        const scarce = rng() < 0.06;
        const seatsLeft = scarce ? randInt(rng, 0, 2) : randInt(rng, 3, 28);

        flights.push({
          id: key,
          flightNo: `${airline.code}-${1000 + (salt % 8000)}`,
          airline: airline.name,
          originCityId: route.origin,
          destCityId: route.dest,
          departAt: depart,
          arriveAt: arrive,
          priceRub: priceForFlight(route.origin, route.dest, isoDate, airline.code, salt, rng),
          seatsLeft,
        });
      }
    }
  }

  return flights;
}

function generateHotelsAndAvailability(rng: () => number): {
  hotels: GeneratedHotel[];
  availability: GeneratedAvailability[];
} {
  const hotels: GeneratedHotel[] = [];
  const availability: GeneratedAvailability[] = [];
  const dates = eachIsoDate(CATALOG_START, CATALOG_END);
  const starCycle = [3, 4, 4, 5];

  for (const city of CITIES) {
    const count = hash32(city.id) % 2 === 0 ? 4 : 3;
    for (let index = 0; index < count; index += 1) {
      const hotelId = `${city.id}-H${index + 1}`;
      const stars = starCycle[index % starCycle.length];
      hotels.push({
        id: hotelId,
        cityId: city.id,
        name: HOTEL_TEMPLATES[index](city.name),
        stars,
      });

      for (const isoDate of dates) {
        const weekday = weekdayUtc(isoDate);
        const weekend = weekday === 5 || weekday === 6;
        let standard = standardNightPrice(city.tier, stars);
        if (weekend) {
          standard *= 1.1;
        }
        if (city.id === "AER" && (isoDate.startsWith("2026-08") || isoDate.startsWith("2026-09"))) {
          standard *= 1.2;
        }
        standard *= randFloat(rng, 0.94, 1.06);
        const twin = Math.round((standard * 1.45) / 100) * 100;
        const standardPrice = Math.round(standard / 100) * 100;
        const zeroOneType = rng() < 0.08;
        const zeroWhich = rng() < 0.5 ? "standard" : "twin";

        for (const roomType of ["standard", "twin"] as const) {
          let roomsLeft = randInt(rng, 0, 6);
          if (zeroOneType && roomType === zeroWhich) {
            roomsLeft = 0;
          }
          availability.push({
            id: `${hotelId}-${isoDate}-${roomType}`,
            hotelId,
            date: wallDateTime(isoDate, 0, 0),
            roomType,
            roomsLeft,
            pricePerNightRub: roomType === "twin" ? twin : standardPrice,
          });
        }
      }
    }
  }

  return { hotels, availability };
}

function ensureDemoInventory(catalog: TravelCatalog): void {
  const demoNights = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"];

  for (const cityId of ["MOW", "LED"]) {
    const cityHotels = catalog.hotels.filter((hotel) => hotel.cityId === cityId);
    const chosen = cityHotels[0];
    if (!chosen) {
      throw new Error(`No hotels generated for ${cityId}`);
    }
    for (const night of demoNights) {
      for (const roomType of ["standard", "twin"] as const) {
        const row = catalog.availability.find(
          (item) =>
            item.hotelId === chosen.id &&
            item.roomType === roomType &&
            item.date.toISOString().slice(0, 10) === night,
        );
        if (!row) {
          throw new Error(`Missing availability ${chosen.id} ${night} ${roomType}`);
        }
        if (roomType === "twin") {
          row.roomsLeft = Math.max(row.roomsLeft, 1);
        } else {
          row.roomsLeft = Math.max(row.roomsLeft, 2);
        }
      }
    }
  }

  const bumpSeats = (origin: string, dest: string, isoDate: string) => {
    const matches = catalog.flights
      .filter(
        (flight) =>
          flight.originCityId === origin &&
          flight.destCityId === dest &&
          flight.departAt.toISOString().slice(0, 10) === isoDate,
      )
      .sort((left, right) => left.priceRub - right.priceRub);
    for (const flight of matches.slice(0, 3)) {
      flight.seatsLeft = Math.max(flight.seatsLeft, 2);
    }
  };

  bumpSeats("MOW", "LED", "2026-09-01");
  bumpSeats("LED", "MOW", "2026-09-05");
}

export function generateTravelCatalog(seed = TRAVEL_SEED): TravelCatalog {
  const rng = mulberry32(seed);
  const flights = generateFlights(rng);
  const { hotels, availability } = generateHotelsAndAvailability(rng);
  const catalog: TravelCatalog = {
    cities: CITIES,
    flights,
    hotels,
    availability,
  };
  ensureDemoInventory(catalog);
  return catalog;
}
