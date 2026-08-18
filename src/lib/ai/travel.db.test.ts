import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { processNextJob } from "./jobs";
import { resetLlmClientStateForTests, setLlmCompleteForTests } from "./llm";
import { processSuggestTravel, TRAVEL_DISCLAIMER } from "./travel";
import { ingestInbound } from "../mail/ingest";
import { parseMailFields } from "../mail/parse";
import { packageTotalRub } from "../travel/price";
import { seedUsers } from "../seed-users";
import { searchTravel } from "../travel/search";

const databaseUrl = process.env.DATABASE_URL;
const prisma = databaseUrl ? new PrismaClient() : null;

describe.skipIf(!prisma)("suggest_travel jobs", () => {
  let annaId = "";
  const annaEmail = "communicationassistant36@gmail.com";

  beforeAll(async () => {
    if (!prisma) {
      return;
    }
    await seedUsers(prisma);
    const anna = await prisma.user.findUnique({ where: { code: "M36" } });
    annaId = anna?.id ?? "";
  });

  beforeEach(async () => {
    resetLlmClientStateForTests();
    if (!prisma) {
      return;
    }
    await prisma.client.deleteMany({
      where: { email: { startsWith: "travel-test-" } },
    });
  });

  afterEach(() => {
    resetLlmClientStateForTests();
  });

  afterAll(async () => {
    await prisma?.client.deleteMany({
      where: { email: { startsWith: "travel-test-" } },
    });
    await prisma?.$disconnect();
  });

  async function seedThread(clientEmail: string, text: string) {
    const inbound = await ingestInbound(prisma!, {
      managerId: annaId,
      managerEmail: annaEmail,
      gmailUid: `travel-${clientEmail}`,
      parsed: parseMailFields({
        fromEmail: clientEmail,
        fromName: "Клиент",
        subject: "Командировка",
        text,
      }),
    });
    if (inbound.status !== "created") {
      throw new Error("failed to seed inbound");
    }
    return { conversationId: inbound.conversationId };
  }

  it("writes a travel_offer without flights when destination is Tomsk", async () => {
    const { conversationId } = await seedThread(
      "travel-test-tomsk@example.com",
      "Нужна командировка в Томск на неделю, двое человек.",
    );
    setLlmCompleteForTests(async (_system, _user, schemaName) => {
      if (schemaName !== "travel-extract") {
        throw new Error(`unexpected schema ${schemaName}`);
      }
      return {
        origin: "Москва",
        destination: "Томск",
        dateFrom: "2026-09-01",
        dateTo: "2026-09-08",
        people: 2,
        needReturn: true,
        needHotel: true,
        notes: "",
        confidence: 0.9,
        unresolved: [],
      };
    });

    await processSuggestTravel(prisma!, { id: "direct-tomsk", conversationId });
    const note = await prisma!.aiNote.findFirst({ where: { conversationId } });
    expect(note).toMatchObject({ type: "travel_offer" });
    expect(note?.body).toMatch(/Томск/);
    expect(note?.body).toMatch(new RegExp(TRAVEL_DISCLAIMER));
    const payload = note?.payload as Record<string, unknown>;
    expect(payload.packages).toEqual([]);
    expect(payload.destCityId).toBeNull();
  });

  it("writes packages with a code-recomputed total for Petersburg", async () => {
    const { conversationId } = await seedThread(
      "travel-test-led@example.com",
      "Двое сотрудников, Москва — Петербург, с 1 по 5 сентября.",
    );
    setLlmCompleteForTests(async (_system, user, schemaName) => {
      if (schemaName === "travel-extract") {
        return {
          origin: "Москва",
          destination: "Петербург",
          dateFrom: "2026-09-01",
          dateTo: "2026-09-05",
          people: 2,
          needReturn: true,
          needHotel: true,
          notes: "двое",
          confidence: 0.92,
          unresolved: [],
        };
      }
      if (schemaName !== "travel-pack") {
        throw new Error(`unexpected schema ${schemaName}`);
      }
      const jsonStart = user.indexOf("{");
      const slim = JSON.parse(user.slice(jsonStart)) as {
        outbound: Array<{ id: string; priceRub: number }>;
        returns: Array<{ id: string; priceRub: number }>;
        hotels: Array<{ id: string; roomType: string; stayCostRub: number }>;
      };
      return {
        summary: "Два сотрудника, Москва → Санкт-Петербург, 1–5 сентября 2026.",
        packages: [
          {
            label: "Оптимальная цена",
            outboundFlightId: slim.outbound[0]?.id,
            returnFlightId: slim.returns[0]?.id,
            hotelId: slim.hotels[0]?.id,
            roomType: slim.hotels[0]?.roomType,
            totalRub: 1,
            why: "Самые дешёвые подходящие рейсы и отель.",
          },
        ],
        warnings: [],
      };
    });

    await processSuggestTravel(prisma!, { id: "direct-led", conversationId });
    const note = await prisma!.aiNote.findFirst({ where: { conversationId } });
    expect(note).toMatchObject({ type: "travel_offer" });
    expect(note?.body).toMatch(new RegExp(TRAVEL_DISCLAIMER));
    const payload = note?.payload as {
      packages: Array<{
        outboundFlightId: string;
        returnFlightId: string;
        hotelId: string;
        totalRub: number;
      }>;
    };
    expect(payload.packages.length).toBeGreaterThanOrEqual(1);
    const pack = payload.packages[0]!;
    const search = await searchTravel(prisma!, {
      originCityId: "MOW",
      destCityId: "LED",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-05",
      people: 2,
      needReturn: true,
      needHotel: true,
    });
    const outbound = search.outbound.find((item) => item.id === pack.outboundFlightId);
    const inbound = search.returns.find((item) => item.id === pack.returnFlightId);
    const hotel = search.hotels.find((item) => item.id === pack.hotelId);
    expect(outbound).toBeTruthy();
    expect(inbound).toBeTruthy();
    expect(hotel).toBeTruthy();
    expect(pack.totalRub).toBe(
      packageTotalRub({
        outboundPriceRub: outbound!.priceRub,
        returnPriceRub: inbound!.priceRub,
        hotelCostRub: hotel!.stayCostRub,
        people: 2,
      }),
    );
    expect(pack.totalRub).not.toBe(1);
  });

  it("asks to clarify dates and does not pack when dates are missing", async () => {
    const { conversationId } = await seedThread(
      "travel-test-gaps@example.com",
      "Командировку для одного человека, Москва–Питер",
    );
    setLlmCompleteForTests(async (_system, _user, schemaName) => {
      if (schemaName !== "travel-extract") {
        throw new Error(`unexpected schema ${schemaName}`);
      }
      return {
        origin: "Москва",
        destination: "Питер",
        dateFrom: null,
        dateTo: null,
        people: 1,
        needReturn: false,
        needHotel: false,
        notes: "",
        confidence: 0.95,
        unresolved: [],
        missing: ["dateFrom", "dateTo"],
      };
    });

    await processSuggestTravel(prisma!, { id: "direct-gaps", conversationId });
    const note = await prisma!.aiNote.findFirst({ where: { conversationId } });
    expect(note?.body).toMatch(/уточните даты/i);
    const payload = note?.payload as Record<string, unknown>;
    expect(payload.packages).toEqual([]);
  });

  it("searches the latest dates from extract, not older dates in the thread", async () => {
    const { conversationId } = await seedThread(
      "travel-test-latest-dates@example.com",
      "Двое, Москва — Петербург, с 10.11 по 15.11. Нет, давайте с 12.11 по 17.11.",
    );
    let packedDates: { dateFrom?: string; dateTo?: string } | null = null;
    setLlmCompleteForTests(async (_system, user, schemaName) => {
      if (schemaName === "travel-extract") {
        return {
          origin: "Москва",
          destination: "Петербург",
          dateFrom: "2026-11-12",
          dateTo: "2026-11-17",
          people: 2,
          needReturn: true,
          needHotel: true,
          notes: "",
          confidence: 0.9,
          unresolved: [],
          missing: [],
        };
      }
      if (schemaName !== "travel-pack") {
        throw new Error(`unexpected schema ${schemaName}`);
      }
      const jsonStart = user.indexOf("{");
      const slim = JSON.parse(user.slice(jsonStart)) as {
        dateFrom: string;
        dateTo: string;
        outbound: Array<{ id: string }>;
        returns: Array<{ id: string }>;
        hotels: Array<{ id: string; roomType: string }>;
      };
      packedDates = { dateFrom: slim.dateFrom, dateTo: slim.dateTo };
      return {
        summary: "Двое, Москва → Санкт-Петербург, 12–17 ноября 2026.",
        packages: slim.outbound[0]
          ? [
              {
                label: "Оптимальная цена",
                outboundFlightId: slim.outbound[0]?.id,
                returnFlightId: slim.returns[0]?.id ?? null,
                hotelId: slim.hotels[0]?.id ?? null,
                roomType: slim.hotels[0]?.roomType,
                totalRub: 1,
                why: "По уточнённым датам.",
              },
            ]
          : [],
        warnings: [],
      };
    });

    await processSuggestTravel(prisma!, { id: "direct-latest-dates", conversationId });
    const note = await prisma!.aiNote.findFirst({ where: { conversationId } });
    const payload = note?.payload as { summary?: string; packages: unknown[] };
    const blob = `${note?.body ?? ""}\n${payload.summary ?? ""}\n${JSON.stringify(packedDates ?? payload)}`;
    expect(blob).toMatch(/2026-11-12|12–17 ноября|12\.11/);
    expect(blob).not.toMatch(/2026-11-10/);
    if (packedDates) {
      expect(packedDates).toMatchObject({ dateFrom: "2026-11-12", dateTo: "2026-11-17" });
    }
  });

  it("claims a suggest_travel job through the shared queue", async () => {
    const { conversationId } = await seedThread(
      "travel-test-claim@example.com",
      "Нужна командировка в Томск.",
    );
    const job = await prisma!.job.create({
      data: {
        type: "suggest_travel",
        status: "pending",
        conversationId,
        payload: {},
        createdAt: new Date("2000-01-01T00:00:00.000Z"),
      },
    });
    setLlmCompleteForTests(async (_system, _user, schemaName) => {
      if (schemaName === "quality") {
        return {
          literacy: 5,
          spelling: 5,
          punctuation: 5,
          businessStyle: 5,
          overall: 5,
          issues: [],
          hint: "",
          showHint: false,
        };
      }
      if (schemaName === "travel-extract") {
        return {
          origin: "Москва",
          destination: "Томск",
          dateFrom: "2026-09-01",
          dateTo: "2026-09-08",
          people: 1,
          needReturn: true,
          needHotel: true,
          notes: "",
          confidence: 0.8,
          unresolved: [],
        };
      }
      throw new Error(`unexpected schema ${schemaName}`);
    });

    let claimedOurs = false;
    for (let step = 0; step < 8; step += 1) {
      const worked = await processNextJob(prisma!);
      const current = await prisma!.job.findUnique({ where: { id: job.id } });
      if (current?.status === "done" || current?.status === "failed") {
        claimedOurs = true;
        break;
      }
      if (!worked) {
        break;
      }
    }
    expect(claimedOurs).toBe(true);
    const done = await prisma!.job.findUnique({ where: { id: job.id } });
    expect(done?.status).toBe("done");
    const note = await prisma!.aiNote.findFirst({
      where: { conversationId, type: "travel_offer" },
    });
    expect(note?.body).toMatch(/Томск/);
  });
});
