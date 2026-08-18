import { afterEach, describe, expect, it } from "vitest";
import {
  completeJson,
  extractJsonObject,
  parseJsonObject,
  resetLlmClientStateForTests,
  setLlmRawCompleteForTests,
  LlmJsonError,
} from "./llm";

afterEach(() => {
  resetLlmClientStateForTests();
});

describe("extractJsonObject", () => {
  it("parses a bare object", () => {
    expect(parseJsonObject('{"literacy":5}')).toEqual({ literacy: 5 });
  });

  it("strips markdown fences and think tags", () => {
    const text = `<think>размышляю</think>\n\`\`\`json\n{"ok":true}\n\`\`\``;
    expect(extractJsonObject(text)).toBe('{"ok":true}');
    expect(parseJsonObject(text)).toEqual({ ok: true });
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJsonObject("definitely not json")).toThrow(LlmJsonError);
    expect(() => parseJsonObject("{not json")).toThrow(LlmJsonError);
  });
});

describe("completeJson", () => {
  it("retries once after invalid JSON then succeeds", async () => {
    const calls: number[] = [];
    setLlmRawCompleteForTests(async ({ attempt }) => {
      calls.push(attempt);
      if (attempt === 1) {
        return "не JSON";
      }
      return '{"literacy":5}';
    });
    await expect(completeJson("sys", "user", "quality")).resolves.toEqual({ literacy: 5 });
    expect(calls).toEqual([1, 2]);
  });

  it("fails after two invalid JSON responses without calling a network host", async () => {
    setLlmRawCompleteForTests(async () => "still not json");
    await expect(completeJson("sys", "user", "quality")).rejects.toBeInstanceOf(LlmJsonError);
  });

  it("passes the requested temperature into the raw complete hook", async () => {
    const seen: number[] = [];
    setLlmRawCompleteForTests(async ({ temperature }) => {
      seen.push(temperature);
      return '{"ok":true}';
    });
    await completeJson("sys", "user", "travel-extract", { temperature: 0 });
    await completeJson("sys", "user", "travel-pack", { temperature: 0.2 });
    await completeJson("sys", "user", "quality");
    expect(seen).toEqual([0, 0.2, 0.1]);
  });
});
