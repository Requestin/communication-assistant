import { packageTotalRub } from "./price";
import type { FlightCandidate, HotelCandidate } from "./search";

export type ModelPackage = {
  label: string;
  outboundFlightId: string;
  returnFlightId: string | null;
  hotelId: string | null;
  roomType: "standard" | "twin" | null;
  totalRub: number;
  why: string;
};

export type ValidatedPackage = ModelPackage & {
  outboundLabel: string;
  returnLabel: string | null;
  hotelLabel: string | null;
  people: number;
  outboundSeatRub: number;
  returnSeatRub: number | null;
  hotelCostRub: number;
};

export type PackCandidates = {
  people: number;
  needReturn: boolean;
  needHotel: boolean;
  outbound: FlightCandidate[];
  returns: FlightCandidate[];
  hotels: HotelCandidate[];
};

function flightLabel(flight: FlightCandidate, people: number): string {
  const when = new Date(flight.departAt).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const seats = Math.max(1, people);
  if (seats > 1) {
    return `${flight.airline} ${flight.flightNo}, ${when}, ${flight.priceRub} ₽ × ${seats} чел. = ${flight.priceRub * seats} ₽`;
  }
  return `${flight.airline} ${flight.flightNo}, ${when}, ${flight.priceRub} ₽`;
}

function hotelLabel(hotel: HotelCandidate): string {
  const room = hotel.roomType === "twin" ? "twin" : "standard";
  return `${hotel.name}, ${hotel.stars}★, ${room}, ${hotel.nights} ноч., ${hotel.stayCostRub} ₽ проживание`;
}

export function validateTravelPackage(
  raw: ModelPackage,
  candidates: PackCandidates,
): { ok: true; value: ValidatedPackage } | { ok: false; reason: string } {
  const outbound = candidates.outbound.find((item) => item.id === raw.outboundFlightId);
  if (!outbound) {
    return { ok: false, reason: "чужой id рейса туда" };
  }
  if (outbound.seatsLeft < candidates.people) {
    return { ok: false, reason: "мало мест на рейсе туда" };
  }

  let returnFlight: FlightCandidate | null = null;
  if (candidates.needReturn) {
    if (!raw.returnFlightId) {
      return { ok: false, reason: "нет обратного рейса" };
    }
    returnFlight = candidates.returns.find((item) => item.id === raw.returnFlightId) ?? null;
    if (!returnFlight) {
      return { ok: false, reason: "чужой id обратного рейса" };
    }
    if (returnFlight.seatsLeft < candidates.people) {
      return { ok: false, reason: "мало мест на обратном рейсе" };
    }
  }

  let hotel: HotelCandidate | null = null;
  if (candidates.needHotel) {
    if (!raw.hotelId) {
      return { ok: false, reason: "нет отеля" };
    }
    hotel =
      candidates.hotels.find(
        (item) => item.id === raw.hotelId && (!raw.roomType || item.roomType === raw.roomType),
      ) ?? candidates.hotels.find((item) => item.id === raw.hotelId) ?? null;
    if (!hotel) {
      return { ok: false, reason: "чужой id отеля" };
    }
  }

  const totalRub = packageTotalRub({
    outboundPriceRub: outbound.priceRub,
    returnPriceRub: returnFlight?.priceRub ?? null,
    hotelCostRub: hotel?.stayCostRub ?? 0,
    people: candidates.people,
  });

  return {
    ok: true,
    value: {
      label: raw.label.trim() || "Вариант",
      outboundFlightId: outbound.id,
      returnFlightId: returnFlight?.id ?? null,
      hotelId: hotel?.id ?? null,
      roomType: hotel?.roomType ?? null,
      totalRub,
      why: raw.why.trim(),
      people: candidates.people,
      outboundSeatRub: outbound.priceRub,
      returnSeatRub: returnFlight?.priceRub ?? null,
      hotelCostRub: hotel?.stayCostRub ?? 0,
      outboundLabel: flightLabel(outbound, candidates.people),
      returnLabel: returnFlight ? flightLabel(returnFlight, candidates.people) : null,
      hotelLabel: hotel ? hotelLabel(hotel) : null,
    },
  };
}

export function cheapestFallbackPackage(candidates: PackCandidates): ValidatedPackage | null {
  const outbound = candidates.outbound[0];
  if (!outbound) {
    return null;
  }
  const returnFlight = candidates.needReturn ? (candidates.returns[0] ?? null) : null;
  if (candidates.needReturn && !returnFlight) {
    return null;
  }
  const hotel = candidates.needHotel ? (candidates.hotels[0] ?? null) : null;
  if (candidates.needHotel && !hotel) {
    return null;
  }
  const result = validateTravelPackage(
    {
      label: "Оптимальная цена",
      outboundFlightId: outbound.id,
      returnFlightId: returnFlight?.id ?? null,
      hotelId: hotel?.id ?? null,
      roomType: hotel?.roomType ?? null,
      totalRub: 0,
      why: "Самые дешёвые подходящие рейсы и отель из выборки.",
    },
    candidates,
  );
  return result.ok ? result.value : null;
}
