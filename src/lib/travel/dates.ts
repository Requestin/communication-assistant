export const CATALOG_START = "2026-08-18";
export const CATALOG_END = "2026-12-31";

export function eachIsoDate(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = parseIsoDate(start);
  const last = parseIsoDate(end);
  while (cursor.getTime() <= last.getTime()) {
    dates.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function parseIsoDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    throw new Error(`Invalid date: ${iso}`);
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function weekdayUtc(iso: string): number {
  return parseIsoDate(iso).getUTCDay();
}

export function wallDateTime(isoDate: string, hours: number, minutes: number): Date {
  const date = parseIsoDate(isoDate);
  date.setUTCHours(hours, minutes, 0, 0);
  return date;
}

export function isoDateOf(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return false;
  }
  try {
    return toIsoDate(parseIsoDate(iso)) === iso;
  } catch {
    return false;
  }
}
