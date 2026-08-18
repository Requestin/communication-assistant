import { describe, expect, it } from "vitest";
import { staffAlertsFromJobs } from "./inbox";

describe("staffAlertsFromJobs", () => {
  it("shows a Russian quality pending and failed note without job error text", () => {
    expect(
      staffAlertsFromJobs([{ type: "evaluate_quality", status: "processing" }]),
    ).toEqual([{ kind: "quality_pending", message: "ИИ оценивает ответ…" }]);
    expect(staffAlertsFromJobs([{ type: "evaluate_quality", status: "failed" }])).toEqual([
      { kind: "quality_failed", message: "Не удалось оценить ответ" },
    ]);
  });

  it("maps a failed travel job to an unavailable-model message", () => {
    expect(staffAlertsFromJobs([{ type: "suggest_travel", status: "failed" }])).toEqual([
      {
        kind: "suggest_failed",
        message: "Не удалось подобрать варианты. ИИ недоступен.",
      },
    ]);
  });

  it("ignores done jobs and uses only the latest of each type", () => {
    expect(
      staffAlertsFromJobs([
        { type: "evaluate_quality", status: "done" },
        { type: "evaluate_quality", status: "failed" },
        { type: "suggest_travel", status: "pending" },
      ]),
    ).toEqual([]);
  });
});
