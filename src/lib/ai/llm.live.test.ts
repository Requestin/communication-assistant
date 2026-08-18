import { describe, expect, it } from "vitest";
import { completeJson } from "./llm";

const live = process.env.LLM_LIVE === "1";

describe.skipIf(!live)("live llama-server JSON", () => {
  it("returns an object for a tiny quality prompt", async () => {
    const parsed = await completeJson<Record<string, unknown>>(
      "Верни строго JSON объект {\"ok\": true} без текста вокруг.",
      "ping",
      "live-ping",
    );
    expect(parsed).toEqual(expect.objectContaining({ ok: true }));
  });
});
