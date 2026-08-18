import type { Message } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { parseJsonObject } from "./llm";
import {
  buildQualityUserPrompt,
  computeOverall,
  computeShowHint,
  parseQualityJson,
  QualityParseError,
} from "./quality";

const valid = {
  literacy: 4,
  spelling: 3,
  punctuation: 5,
  businessStyle: 2,
  overall: 9.9,
  issues: [
    "Опечатка: «камандировку» → «командировку»",
    "Сленг: «ок, ща сделаю» не подходит для делового ответа",
  ],
  hint: "Перепишите нейтрально.",
  showHint: false,
};

describe("parseQualityJson", () => {
  it("accepts the §9.1 contract and recomputes overall and showHint", () => {
    const score = parseQualityJson(valid);
    expect(score.literacy).toBe(4);
    expect(score.spelling).toBe(3);
    expect(score.punctuation).toBe(5);
    expect(score.businessStyle).toBe(2);
    expect(score.overall).toBe(3.5);
    expect(score.showHint).toBe(true);
    expect(score.issues).toHaveLength(2);
  });

  it("keeps silent when all scores are 4–5 and issues are empty", () => {
    const score = parseQualityJson({
      literacy: 5,
      spelling: 5,
      punctuation: 4,
      businessStyle: 5,
      overall: 1,
      issues: [],
      hint: "",
      showHint: true,
    });
    expect(score.overall).toBe(4.8);
    expect(score.showHint).toBe(false);
  });

  it("stays silent when scores are 5–5–5–5 even if the model attached issues", () => {
    const score = parseQualityJson({
      literacy: 5,
      spelling: 5,
      punctuation: 5,
      businessStyle: 5,
      issues: ["Повторите даты поездки"],
      hint: "Добавьте даты",
      showHint: true,
    });
    expect(score.overall).toBe(5);
    expect(score.issues).toEqual([]);
    expect(score.hint).toBe("");
    expect(score.showHint).toBe(false);
  });

  it("drops stylistic nits when all four scores are at least 4", () => {
    const score = parseQualityJson({
      literacy: 5,
      spelling: 5,
      punctuation: 5,
      businessStyle: 4,
      overall: 1,
      issues: ["Сейчас звучит разговорно"],
      hint: "Сформулируйте строже",
      showHint: true,
    });
    expect(score.overall).toBe(4.8);
    expect(score.issues).toEqual([]);
    expect(score.hint).toBe("");
    expect(score.showHint).toBe(false);
  });

  it("rejects scores outside 1–5", () => {
    expect(() => parseQualityJson({ ...valid, literacy: 0 })).toThrow(QualityParseError);
    expect(() => parseQualityJson({ ...valid, spelling: 6 })).toThrow(QualityParseError);
    expect(() => parseQualityJson("nope")).toThrow(QualityParseError);
  });

  it("parses fenced model output then validates", () => {
    const parsed = parseJsonObject("```json\n" + JSON.stringify(valid) + "\n```");
    expect(parseQualityJson(parsed).overall).toBe(3.5);
  });
});

describe("quality helpers", () => {
  it("rounds overall to one decimal", () => {
    expect(computeOverall(5, 5, 5, 4)).toBe(4.8);
  });

  it("uses the architecture showHint rule", () => {
    expect(
      computeShowHint({
        literacy: 4,
        spelling: 4,
        punctuation: 4,
        businessStyle: 4,
        overall: 4,
        issues: [],
      }),
    ).toBe(false);
    expect(
      computeShowHint({
        literacy: 3,
        spelling: 5,
        punctuation: 5,
        businessStyle: 5,
        overall: 4.5,
        issues: [],
      }),
    ).toBe(true);
    expect(
      computeShowHint({
        literacy: 5,
        spelling: 5,
        punctuation: 5,
        businessStyle: 5,
        overall: 5,
        issues: ["Сейчас звучит разговорно"],
      }),
    ).toBe(false);
  });
});

function fakeOutbound(bodyText: string, subject: string): Message {
  return {
    id: "out-1",
    conversationId: "c1",
    direction: "outbound",
    fromEmail: "anna@example.com",
    toEmail: "client@example.com",
    subject,
    bodyText,
    sentAt: new Date("2026-08-18T12:00:00.000Z"),
    gmailUid: null,
    gmailMessageId: null,
    smtpMessageId: null,
    createdAt: new Date("2026-08-18T12:00:00.000Z"),
  };
}

describe("buildQualityUserPrompt", () => {
  it("does not put the thread subject into the scored text", () => {
    const outbound = fakeOutbound(
      "Извините, на выбранные даты нет номеров. Предлагаем рассмотреть другие даты.",
      "Re: Командировка в Питер",
    );
    const prompt = buildQualityUserPrompt(outbound, []);
    expect(prompt).not.toContain("Питер");
    expect(prompt).not.toContain("Тема:");
    expect(prompt).toContain("на выбранные даты нет номеров");
  });

  it("keeps Питер when the manager wrote it in the body", () => {
    const outbound = fakeOutbound("В Питере на эти даты номеров нет.", "Re: Командировка");
    const prompt = buildQualityUserPrompt(outbound, []);
    expect(prompt).toContain("Питер");
  });
});
