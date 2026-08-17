import { describe, expect, it } from "vitest";
import { buildRoutes, routeKey } from "./routes";

describe("travel routes", () => {
  it("builds about 110 unique directions and does not duplicate LED–MOW", () => {
    const routes = buildRoutes();
    const keys = routes.map((route) => routeKey(route.origin, route.dest));

    expect(new Set(keys).size).toBe(routes.length);
    expect(routes.length).toBeGreaterThanOrEqual(100);
    expect(routes.length).toBeLessThanOrEqual(120);

    const moscowLed = routes.filter(
      (route) =>
        (route.origin === "MOW" && route.dest === "LED") ||
        (route.origin === "LED" && route.dest === "MOW"),
    );
    expect(moscowLed).toHaveLength(2);
    expect(moscowLed.every((route) => route.flightsPerDay === 4)).toBe(true);
  });
});
