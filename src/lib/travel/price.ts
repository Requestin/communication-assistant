import { eachIsoDate, parseIsoDate, toIsoDate } from "./dates";

export type RoomTypeChoice = "standard" | "twin";

export function hotelNights(dateFrom: string, dateTo: string): string[] {
  const lastNight = parseIsoDate(dateTo);
  lastNight.setUTCDate(lastNight.getUTCDate() - 1);
  const lastIso = toIsoDate(lastNight);
  if (lastNight.getTime() < parseIsoDate(dateFrom).getTime()) {
    return [];
  }
  return eachIsoDate(dateFrom, lastIso);
}

export function roomsForStay(people: number, roomType: RoomTypeChoice): number {
  if (roomType === "twin") {
    return Math.max(1, Math.ceil(people / 2));
  }
  return Math.max(1, people);
}

export function hotelStayCost(nightPrices: number[], rooms: number): number {
  return nightPrices.reduce((sum, price) => sum + price * rooms, 0);
}

export function packageTotalRub(input: {
  outboundPriceRub: number;
  returnPriceRub: number | null;
  hotelCostRub: number;
  people: number;
}): number {
  const seats = Math.max(1, input.people);
  const flights = input.outboundPriceRub * seats + (input.returnPriceRub ?? 0) * seats;
  return flights + input.hotelCostRub;
}
