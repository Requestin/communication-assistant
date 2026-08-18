import { describe, expect, it } from "vitest";
import { formatOfferInsertText, parseTravelExtract, TRAVEL_DISCLAIMER } from "./travel";

describe("parseTravelExtract", () => {
  it("defaults people to 1 and keeps ISO dates", () => {
    const parsed = parseTravelExtract({
      origin: "Москва",
      destination: "Питер",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-05",
      confidence: 0.9,
    });
    expect(parsed.people).toBe(1);
    expect(parsed.dateFrom).toBe("2026-09-01");
    expect(parsed.dateTo).toBe("2026-09-05");
    expect(parsed.needReturn).toBe(true);
    expect(parsed.needHotel).toBe(true);
  });

  it("normalizes dotted dates to 2026 ISO", () => {
    const parsed = parseTravelExtract({
      origin: "МСК",
      destination: "LED",
      dateFrom: "01.09",
      dateTo: "05.09.26",
      people: 2,
      confidence: 0.8,
    });
    expect(parsed.dateFrom).toBe("2026-09-01");
    expect(parsed.dateTo).toBe("2026-09-05");
    expect(parsed.people).toBe(2);
  });
});

describe("formatOfferInsertText", () => {
  it("includes the disclaimer and recomputed total", () => {
    const text = formatOfferInsertText({
      kind: "travel_offer",
      summary: "Москва → Петербург",
      packages: [
        {
          label: "Оптимальная цена",
          outboundFlightId: "out",
          returnFlightId: "ret",
          hotelId: "hot",
          roomType: "twin",
          totalRub: 38000,
          why: "дешевле",
          outboundLabel: "SU100",
          returnLabel: "SU101",
          hotelLabel: "Невский",
          people: 2,
          outboundSeatRub: 5000,
          returnSeatRub: 6000,
          hotelCostRub: 16000,
        },
      ],
      warnings: [],
      disclaimer: TRAVEL_DISCLAIMER,
      originCityId: "MOW",
      destCityId: "LED",
      people: 2,
    });
    expect(text).toContain(TRAVEL_DISCLAIMER);
    expect(text).toContain("38000 ₽");
    expect(text).toContain("SU100");
  });
});
