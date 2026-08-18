import { describe, expect, it } from "vitest";
import { resolveCity } from "./resolve-city";

describe("resolveCity", () => {
  it("maps Peterburg aliases and LED to LED", () => {
    expect(resolveCity("Питер")?.id).toBe("LED");
    expect(resolveCity("СПб")?.id).toBe("LED");
    expect(resolveCity("спб.")?.id).toBe("LED");
    expect(resolveCity("LED")?.id).toBe("LED");
    expect(resolveCity("Санкт-Петербург")?.id).toBe("LED");
  });

  it("maps Moscow shorthand to MOW", () => {
    expect(resolveCity("МСК")?.id).toBe("MOW");
    expect(resolveCity("мск")?.id).toBe("MOW");
    expect(resolveCity("Москва")?.id).toBe("MOW");
  });

  it("maps Владик to VVO", () => {
    expect(resolveCity("Владик")?.id).toBe("VVO");
    expect(resolveCity("владивосток")?.id).toBe("VVO");
  });

  it("returns null for Tomsk and empty input", () => {
    expect(resolveCity("Томск")).toBeNull();
    expect(resolveCity("tomsk")).toBeNull();
    expect(resolveCity("")).toBeNull();
    expect(resolveCity(null)).toBeNull();
  });
});
