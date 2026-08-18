import { CITIES, type CitySeed } from "./cities";

export function normalizeCityQuery(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, "е").replace(/[.\-\s]/g, "");
}

export function resolveCity(raw: string | null | undefined): CitySeed | null {
  if (!raw) {
    return null;
  }
  const needle = normalizeCityQuery(raw);
  if (!needle) {
    return null;
  }

  for (const city of CITIES) {
    if (normalizeCityQuery(city.id) === needle || normalizeCityQuery(city.iataCity) === needle) {
      return city;
    }
    if (normalizeCityQuery(city.name) === needle) {
      return city;
    }
    if (city.aliases.some((alias) => normalizeCityQuery(alias) === needle)) {
      return city;
    }
  }
  return null;
}
