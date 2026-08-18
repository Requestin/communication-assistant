import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Job, Message, PrismaClient } from "@prisma/client";
import { completeJson } from "@/lib/ai/llm";
import { clipBody } from "@/lib/mail/parse";
import { isValidIsoDate } from "@/lib/travel/dates";
import { formatTravelOfferInsertText, TRAVEL_DISCLAIMER } from "@/lib/travel/offer-text";
import {
  cheapestFallbackPackage,
  validateTravelPackage,
  type ModelPackage,
  type PackCandidates,
  type ValidatedPackage,
} from "@/lib/travel/pack";
import { resolveCity } from "@/lib/travel/resolve-city";
import { searchTravel, type TravelSearchResult } from "@/lib/travel/search";

const THREAD_CLIP = 8000;
const MISSING_SLOTS = ["origin", "destination", "dateFrom", "dateTo"] as const;
export { TRAVEL_DISCLAIMER };

export type MissingSlot = (typeof MISSING_SLOTS)[number];

export type TravelExtract = {
  origin: string;
  destination: string;
  dateFrom: string | null;
  dateTo: string | null;
  people: number;
  needReturn: boolean;
  needHotel: boolean;
  notes: string;
  confidence: number;
  unresolved: string[];
  missing: MissingSlot[];
};

export type TravelOfferPayload = {
  kind: "travel_offer";
  summary: string;
  packages: ValidatedPackage[];
  warnings: string[];
  disclaimer: string;
  originCityId: string | null;
  destCityId: string | null;
  people: number;
};

function loadPrompt(name: string): string {
  return readFileSync(join(process.cwd(), "prompts", name), "utf8").trim();
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function coerceIsoDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (isValidIsoDate(trimmed)) {
    return trimmed;
  }
  const dmy = /^(\d{1,2})[.](\d{1,2})(?:[.](\d{2,4}))?$/.exec(trimmed);
  if (!dmy) {
    return null;
  }
  let year = dmy[3] ?? "2026";
  if (year.length === 2) {
    year = `20${year}`;
  }
  const iso = `${year}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  return isValidIsoDate(iso) ? iso : null;
}

function parseMissing(value: unknown): MissingSlot[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const allowed = new Set<string>(MISSING_SLOTS);
  return value.filter((item): item is MissingSlot => typeof item === "string" && allowed.has(item));
}

export function parseTravelExtract(input: unknown): TravelExtract {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const unresolved = Array.isArray(raw.unresolved)
    ? raw.unresolved.filter((item): item is string => typeof item === "string")
    : [];
  const dateFrom = coerceIsoDate(raw.dateFrom);
  const dateTo = coerceIsoDate(raw.dateTo);
  const peopleRaw = asNumber(raw.people, 1);
  const people = Number.isInteger(peopleRaw) ? Math.min(20, Math.max(1, peopleRaw)) : 1;
  return {
    origin: asString(raw.origin),
    destination: asString(raw.destination),
    dateFrom,
    dateTo,
    people,
    needReturn: typeof raw.needReturn === "boolean" ? raw.needReturn : Boolean(dateTo),
    needHotel: typeof raw.needHotel === "boolean" ? raw.needHotel : Boolean(dateFrom && dateTo),
    notes: asString(raw.notes),
    confidence: Math.min(1, Math.max(0, asNumber(raw.confidence, 0))),
    unresolved,
    missing: parseMissing(raw.missing),
  };
}

export function requiredGaps(extract: Pick<TravelExtract, "origin" | "destination" | "dateFrom" | "dateTo" | "missing">): MissingSlot[] {
  const gaps = new Set<MissingSlot>(extract.missing);
  if (extract.origin) {
    gaps.delete("origin");
  } else {
    gaps.add("origin");
  }
  if (extract.destination) {
    gaps.delete("destination");
  } else {
    gaps.add("destination");
  }
  if (extract.dateFrom) {
    gaps.delete("dateFrom");
  } else {
    gaps.add("dateFrom");
  }
  if (extract.dateTo) {
    gaps.delete("dateTo");
  } else {
    gaps.add("dateTo");
  }
  return MISSING_SLOTS.filter((slot) => gaps.has(slot));
}

export function formatMissingAdvice(gaps: MissingSlot[]): string {
  const lines = ["Не хватает данных для подбора. Уточните у клиента:"];
  if (gaps.includes("origin")) {
    lines.push("• не указан город вылета");
  }
  if (gaps.includes("destination")) {
    lines.push("• не указан город назначения");
  }
  if (gaps.includes("dateFrom") || gaps.includes("dateTo")) {
    lines.push("• уточните даты поездки (начало и конец)");
  }
  return lines.join("\n");
}

export function buildThreadPrompt(messages: Message[]): string {
  const lines = messages.map((item) => {
    const label = item.direction === "outbound" ? "outbound" : "inbound";
    return `[${label}] ${item.bodyText}`;
  });
  let text = lines.join("\n\n");
  if (text.length > THREAD_CLIP) {
    text = text.slice(-THREAD_CLIP);
  }
  return text || "(лента пуста)";
}

function parseModelPackages(input: unknown): { summary: string; packages: ModelPackage[]; warnings: string[] } {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings.filter((item): item is string => typeof item === "string")
    : [];
  const packages = Array.isArray(raw.packages)
    ? raw.packages.flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }
        const row = item as Record<string, unknown>;
        return [
          {
            label: asString(row.label),
            outboundFlightId: asString(row.outboundFlightId),
            returnFlightId: asString(row.returnFlightId) || null,
            hotelId: asString(row.hotelId) || null,
            roomType: row.roomType === "twin" || row.roomType === "standard" ? row.roomType : null,
            totalRub: asNumber(row.totalRub, 0),
            why: asString(row.why),
          } satisfies ModelPackage,
        ];
      })
    : [];
  return { summary: asString(raw.summary), packages, warnings };
}

function formatOfferBody(summary: string, warnings: string[]): string {
  const lines = [summary.trim() || "Подбор по заявке.", "", TRAVEL_DISCLAIMER];
  if (warnings.length > 0) {
    lines.push("", ...warnings.map((item) => `• ${item}`));
  }
  return lines.join("\n");
}

async function writeOffer(
  prisma: PrismaClient,
  conversationId: string,
  payload: TravelOfferPayload,
  title = "Подбор командировки",
): Promise<void> {
  await prisma.aiNote.create({
    data: {
      conversationId,
      type: "travel_offer",
      title,
      body: formatOfferBody(payload.summary, payload.warnings),
      payload,
    },
  });
}

export function formatOfferInsertText(payload: TravelOfferPayload): string {
  return formatTravelOfferInsertText(payload);
}

export async function processSuggestTravel(
  prisma: PrismaClient,
  job: Pick<Job, "id" | "conversationId">,
): Promise<void> {
  const messages = await prisma.message.findMany({
    where: { conversationId: job.conversationId },
    orderBy: { sentAt: "asc" },
  });
  const thread = buildThreadPrompt(messages);
  console.info(`[travel] job=${job.id} threadChars=${thread.length} preview=${clipBody(thread)}`);

  const extracted = parseTravelExtract(
    await completeJson<unknown>(
      loadPrompt("travel-extract-system.md"),
      `Разбери заявку из переписки:\n\n${thread}`,
      "travel-extract",
      { temperature: 0 },
    ),
  );

  const originCity = resolveCity(extracted.origin);
  const destCity = resolveCity(extracted.destination);
  const dateFrom = extracted.dateFrom;
  const dateTo = extracted.dateTo;
  const unresolved = [...extracted.unresolved];
  if (!originCity && extracted.origin) {
    unresolved.push(extracted.origin);
  }
  if (!destCity && extracted.destination) {
    unresolved.push(extracted.destination);
  }

  const unknownOrigin = Boolean(extracted.origin) && !originCity;
  const unknownDest = Boolean(extracted.destination) && !destCity;
  if (unknownOrigin || unknownDest) {
    const unknownCity =
      (!destCity ? extracted.destination : "") ||
      (!originCity ? extracted.origin : "") ||
      unresolved[0];
    await writeOffer(prisma, job.conversationId, {
      kind: "travel_offer",
      summary: unknownCity
        ? `В учебном справочнике нет города «${unknownCity}». Уточните направление.`
        : "Не удалось разобрать города. Уточните заявку.",
      packages: [],
      warnings: unresolved.length > 0 ? unresolved.map((item) => `Не найден город: ${item}`) : [],
      disclaimer: TRAVEL_DISCLAIMER,
      originCityId: originCity?.id ?? null,
      destCityId: destCity?.id ?? null,
      people: extracted.people,
    });
    return;
  }

  const gaps = requiredGaps(extracted);
  if (gaps.length > 0 || !originCity || !destCity || !dateFrom || !dateTo) {
    await writeOffer(prisma, job.conversationId, {
      kind: "travel_offer",
      summary: formatMissingAdvice(gaps.length > 0 ? gaps : requiredGaps(extracted)),
      packages: [],
      warnings: [],
      disclaimer: TRAVEL_DISCLAIMER,
      originCityId: originCity?.id ?? null,
      destCityId: destCity?.id ?? null,
      people: extracted.people,
    });
    return;
  }

  const search = await searchTravel(prisma, {
    originCityId: originCity.id,
    destCityId: destCity.id,
    dateFrom,
    dateTo,
    people: extracted.people,
    needReturn: extracted.needReturn,
    needHotel: extracted.needHotel,
  });

  const warnings: string[] = [];
  if (search.nearestDates) {
    warnings.push("На точную дату вылета пусто — показаны ближайшие даты.");
  }
  if (search.hotelWarning) {
    warnings.push(search.hotelWarning);
  }
  if (search.outbound.length === 0) {
    await writeOffer(prisma, job.conversationId, {
      kind: "travel_offer",
      summary: `Нет подходящих рейсов ${originCity.name} → ${destCity.name} на ${dateFrom}.`,
      packages: [],
      warnings,
      disclaimer: TRAVEL_DISCLAIMER,
      originCityId: originCity.id,
      destCityId: destCity.id,
      people: extracted.people,
    });
    return;
  }
  if (extracted.needReturn && search.returns.length === 0) {
    await writeOffer(prisma, job.conversationId, {
      kind: "travel_offer",
      summary: `Нет обратных рейсов ${destCity.name} → ${originCity.name}${extracted.dateTo ? ` на ${extracted.dateTo}` : ""}.`,
      packages: [],
      warnings,
      disclaimer: TRAVEL_DISCLAIMER,
      originCityId: originCity.id,
      destCityId: destCity.id,
      people: extracted.people,
    });
    return;
  }
  if (extracted.needHotel && search.hotels.length === 0) {
    await writeOffer(prisma, job.conversationId, {
      kind: "travel_offer",
      summary: search.hotelWarning ?? "На эти ночи нет номеров.",
      packages: [],
      warnings,
      disclaimer: TRAVEL_DISCLAIMER,
      originCityId: originCity.id,
      destCityId: destCity.id,
      people: extracted.people,
    });
    return;
  }

  const candidates: PackCandidates = {
    people: extracted.people,
    needReturn: extracted.needReturn,
    needHotel: extracted.needHotel,
    outbound: search.outbound,
    returns: search.returns,
    hotels: search.hotels,
  };

  const packed = parseModelPackages(
    await completeJson<unknown>(
      loadPrompt("travel-pack-system.md"),
      buildPackUserPrompt(extracted, originCity.name, destCity.name, search),
      "travel-pack",
      { temperature: 0.2 },
    ),
  );

  const accepted: ValidatedPackage[] = [];
  for (const item of packed.packages) {
    const checked = validateTravelPackage(item, candidates);
    if (checked.ok) {
      accepted.push(checked.value);
    } else {
      warnings.push(`Пакет «${item.label || "без названия"}» отклонён: ${checked.reason}.`);
    }
  }

  if (accepted.length === 0) {
    const fallback = cheapestFallbackPackage(candidates);
    if (fallback) {
      accepted.push(fallback);
      warnings.push("Модель не дала валидные id — собран пакет по минимальной цене.");
    }
  }

  const summary =
    packed.summary ||
    `${extracted.people} чел., ${originCity.name} → ${destCity.name}, ${dateFrom}${extracted.dateTo ? `–${extracted.dateTo}` : ""}.`;

  await writeOffer(prisma, job.conversationId, {
    kind: "travel_offer",
    summary,
    packages: accepted,
    warnings: [...warnings, ...packed.warnings],
    disclaimer: TRAVEL_DISCLAIMER,
    originCityId: originCity.id,
    destCityId: destCity.id,
    people: extracted.people,
  });
}

function buildPackUserPrompt(
  extract: TravelExtract,
  originName: string,
  destName: string,
  search: TravelSearchResult,
): string {
  const slim = {
    people: extract.people,
    origin: originName,
    destination: destName,
    dateFrom: extract.dateFrom,
    dateTo: extract.dateTo,
    needReturn: extract.needReturn,
    needHotel: extract.needHotel,
    outbound: search.outbound.map((item) => ({
      id: item.id,
      flightNo: item.flightNo,
      airline: item.airline,
      departAt: item.departAt,
      priceRub: item.priceRub,
      seatsLeft: item.seatsLeft,
    })),
    returns: search.returns.map((item) => ({
      id: item.id,
      flightNo: item.flightNo,
      airline: item.airline,
      departAt: item.departAt,
      priceRub: item.priceRub,
      seatsLeft: item.seatsLeft,
    })),
    hotels: search.hotels.map((item) => ({
      id: item.id,
      name: item.name,
      stars: item.stars,
      roomType: item.roomType,
      stayCostRub: item.stayCostRub,
      nights: item.nights,
    })),
  };
  return `Собери 1–2 пакета из этой выборки:\n${JSON.stringify(slim)}`;
}
