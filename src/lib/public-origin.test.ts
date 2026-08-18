import { describe, expect, it } from "vitest";
import { isLoopbackHost, publicOriginFromHeaders } from "./public-origin";

const localApp = "http://127.0.0.1:3010";
const publicApp = "https://assistant.gyhyry.com";
const listenUrl = "https://localhost:3010/";

describe("isLoopbackHost", () => {
  it("recognizes localhost with a port", () => {
    expect(isLoopbackHost("localhost:3010")).toBe(true);
    expect(isLoopbackHost("127.0.0.1:3010")).toBe(true);
    expect(isLoopbackHost("assistant.gyhyry.com")).toBe(false);
  });
});

describe("publicOriginFromHeaders", () => {
  it("prefers the forwarded public host over the listen URL", () => {
    const headers = new Headers({
      host: "localhost:3010",
      "x-forwarded-host": "assistant.gyhyry.com",
      "x-forwarded-proto": "https",
    });
    expect(publicOriginFromHeaders(headers, listenUrl, localApp)).toBe(publicApp);
  });

  it("does not send a local HTTP visit to the public domain", () => {
    const headers = new Headers({ host: "127.0.0.1:3010" });
    expect(publicOriginFromHeaders(headers, "http://localhost:3010/", publicApp)).toBe(
      "http://localhost:3010",
    );
  });

  it("falls back to APP_URL when HTTPS is forwarded onto localhost", () => {
    const headers = new Headers({
      host: "localhost:3010",
      "x-forwarded-proto": "https",
    });
    expect(publicOriginFromHeaders(headers, listenUrl, publicApp)).toBe(publicApp);
  });
});
