import { describe, expect, it } from "vitest";
import { cheapestFallbackPackage, validateTravelPackage, type PackCandidates } from "./pack";
import type { FlightCandidate, HotelCandidate } from "./search";

function flight(id: string, price = 5000, seats = 4): FlightCandidate {
  return {
    id,
    flightNo: "SU100",
    airline: "Аэрофлот",
    originCityId: "MOW",
    destCityId: "LED",
    departAt: "2026-09-01T06:30:00.000Z",
    arriveAt: "2026-09-01T08:00:00.000Z",
    priceRub: price,
    seatsLeft: seats,
    dateShiftDays: 0,
  };
}

function hotel(id: string, cost = 16000): HotelCandidate {
  return {
    id,
    name: "Невский",
    stars: 4,
    roomType: "twin",
    rooms: 1,
    nights: 4,
    stayCostRub: cost,
    nightPrices: [4000, 4000, 4000, 4000],
  };
}

const candidates: PackCandidates = {
  people: 2,
  needReturn: true,
  needHotel: true,
  outbound: [flight("out-1", 5000)],
  returns: [flight("ret-1", 6000)],
  hotels: [hotel("hot-1", 16000)],
};

describe("validateTravelPackage", () => {
  it("rejects ids that were not in the candidate list", () => {
    const result = validateTravelPackage(
      {
        label: "Фейк",
        outboundFlightId: "not-real",
        returnFlightId: "ret-1",
        hotelId: "hot-1",
        roomType: "twin",
        totalRub: 1,
        why: "нет",
      },
      candidates,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/чужой id/);
    }
  });

  it("recomputes total as flights times people plus hotel", () => {
    const result = validateTravelPackage(
      {
        label: "Дешевле",
        outboundFlightId: "out-1",
        returnFlightId: "ret-1",
        hotelId: "hot-1",
        roomType: "twin",
        totalRub: 999999,
        why: "дешево",
      },
      candidates,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalRub).toBe(5000 * 2 + 6000 * 2 + 16000);
      expect(result.value.people).toBe(2);
      expect(result.value.outboundLabel).toContain("5000 ₽ × 2 чел. = 10000 ₽");
      expect(result.value.returnLabel).toContain("6000 ₽ × 2 чел. = 12000 ₽");
      expect(result.value.hotelLabel).toContain("16000 ₽ проживание");
    }
  });

  it("builds a cheapest fallback from the first candidates", () => {
    const fallback = cheapestFallbackPackage(candidates);
    expect(fallback?.outboundFlightId).toBe("out-1");
    expect(fallback?.totalRub).toBe(5000 * 2 + 6000 * 2 + 16000);
  });
});
