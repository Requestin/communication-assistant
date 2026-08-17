import { CITIES } from "./cities";

export type RouteDirection = {
  origin: string;
  dest: string;
  flightsPerDay: number;
};

const LED_LINKS = [
  "OVB",
  "SVX",
  "KZN",
  "GOJ",
  "KUF",
  "ROV",
  "UFA",
  "KJA",
  "KRR",
  "AER",
  "KGD",
  "VVO",
  "IKT",
  "KHV",
] as const;

const REGIONAL_PAIRS: Array<[string, string]> = [
  ["AER", "KRR"],
  ["AER", "ROV"],
  ["AER", "SVX"],
  ["AER", "KZN"],
  ["KGD", "KZN"],
  ["KGD", "SVX"],
  ["SVX", "OVB"],
  ["SVX", "KJA"],
  ["SVX", "KUF"],
  ["SVX", "CEK"],
  ["SVX", "TJM"],
  ["SVX", "UFA"],
  ["OVB", "KJA"],
  ["OVB", "IKT"],
  ["OVB", "KHV"],
  ["IKT", "KHV"],
  ["KHV", "VVO"],
  ["ROV", "KRR"],
  ["ROV", "VOG"],
  ["KZN", "GOJ"],
  ["KZN", "UFA"],
  ["KUF", "CEK"],
];

function bothWays(
  a: string,
  b: string,
  flightsPerDay: number,
): RouteDirection[] {
  return [
    { origin: a, dest: b, flightsPerDay },
    { origin: b, dest: a, flightsPerDay },
  ];
}

export function buildRoutes(): RouteDirection[] {
  const routes: RouteDirection[] = [];
  const seen = new Set<string>();

  const add = (origin: string, dest: string, flightsPerDay: number) => {
    const key = `${origin}-${dest}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    routes.push({ origin, dest, flightsPerDay });
  };

  for (const city of CITIES) {
    if (city.id === "MOW") {
      continue;
    }
    for (const direction of bothWays(city.id, "MOW", 4)) {
      add(direction.origin, direction.dest, direction.flightsPerDay);
    }
  }

  for (const cityId of LED_LINKS) {
    for (const direction of bothWays(cityId, "LED", 3)) {
      add(direction.origin, direction.dest, direction.flightsPerDay);
    }
  }

  for (const [a, b] of REGIONAL_PAIRS) {
    for (const direction of bothWays(a, b, 2)) {
      add(direction.origin, direction.dest, direction.flightsPerDay);
    }
  }

  return routes.sort((left, right) =>
    `${left.origin}-${left.dest}`.localeCompare(`${right.origin}-${right.dest}`),
  );
}

export function routeKey(origin: string, dest: string): string {
  return `${origin}-${dest}`;
}

export function unorderedPair(a: string, b: string): string {
  return [a, b].sort().join("-");
}
