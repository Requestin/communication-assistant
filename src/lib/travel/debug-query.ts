import { CITY_IDS } from "./cities";
import { isValidIsoDate } from "./dates";

export type DebugFlightsQuery = {
  from: string;
  to: string;
  date: string;
};

export type DebugFlightsParseResult =
  | { ok: true; query: DebugFlightsQuery }
  | { ok: false; message: string };

export function parseDebugFlightsQuery(params: URLSearchParams): DebugFlightsParseResult {
  const from = params.get("from")?.trim().toUpperCase() ?? "";
  const to = params.get("to")?.trim().toUpperCase() ?? "";
  const date = params.get("date")?.trim() ?? "";

  if (!from || !to || !date) {
    return {
      ok: false,
      message: "Нужны параметры from, to и date, например from=MOW&to=LED&date=2026-09-01",
    };
  }

  if (!CITY_IDS.includes(from)) {
    return { ok: false, message: `Неизвестный город вылета: ${from}` };
  }

  if (!CITY_IDS.includes(to)) {
    return { ok: false, message: `Неизвестный город прилёта: ${to}` };
  }

  if (!isValidIsoDate(date)) {
    return { ok: false, message: `Неверная дата: ${date}. Ожидается YYYY-MM-DD` };
  }

  return { ok: true, query: { from, to, date } };
}
