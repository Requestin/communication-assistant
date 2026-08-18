import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseEml, parseMailFields, skipReason } from "./parse";

const fixtures = path.join(process.cwd(), "tests/fixtures/mail");

describe("parse inbound mail", () => {
  it("builds inbound fields from From/Subject/Date/text", async () => {
    const parsed = await parseEml(readFileSync(path.join(fixtures, "inbound-plain.eml")));
    expect(parsed.fromEmail).toBe("imap-test-client@example.com");
    expect(parsed.fromName).toBe("Иван Клиент");
    expect(parsed.toEmail).toBe("communicationassistant36@gmail.com");
    expect(parsed.subject).toBe("Тест IMAP");
    expect(parsed.bodyText).toContain("Санкт-Петербург");
    expect(parsed.sentAt.toISOString()).toBe("2026-08-18T00:00:00.000Z");
    expect(parsed.gmailMessageId).toContain("inbound-plain@example.com");
    expect(parsed.hasCommAssistHeader).toBe(false);
  });

  it("turns HTML into text when there is no plain part", async () => {
    const parsed = await parseEml(readFileSync(path.join(fixtures, "inbound-html.eml")));
    expect(parsed.bodyText).toContain("Нужен отель в Казани");
    expect(parsed.bodyText).not.toContain("<p>");
  });

  it("skips Google account notifications as system mail", () => {
    const parsed = parseMailFields({
      fromEmail: "no-reply@accounts.google.com",
      fromName: "Google",
      subject: "Оповещение системы безопасности",
      text: "Новый вход",
    });
    expect(skipReason(parsed, "communicationassistant36@gmail.com")).toBe("system");
    const nested = parseMailFields({
      fromEmail: "noreply@mail.accounts.google.com",
      text: "x",
    });
    expect(skipReason(nested, "communicationassistant36@gmail.com")).toBe("system");
    const client = parseMailFields({
      fromEmail: "k.darchinyants@gmail.com",
      text: "Нужна командировка",
    });
    expect(skipReason(client, "communicationassistant36@gmail.com")).toBeNull();
  });

  it("skips mail from the manager mailbox and X-CommAssist", async () => {
    const self = await parseEml(readFileSync(path.join(fixtures, "from-self.eml")));
    expect(skipReason(self, "communicationassistant36@gmail.com")).toBe("self");

    const header = await parseEml(readFileSync(path.join(fixtures, "commassist-header.eml")));
    expect(skipReason(header, "communicationassistant36@gmail.com")).toBe("header");
  });

  it("normalizes emails and falls back to a subject", () => {
    const parsed = parseMailFields({
      fromEmail: " Client@Example.COM ",
      subject: "  ",
      text: "привет",
    });
    expect(parsed.fromEmail).toBe("client@example.com");
    expect(parsed.subject).toBe("(без темы)");
  });
});
