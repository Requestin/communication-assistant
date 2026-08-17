import { simpleParser, type ParsedMail, type Source } from "mailparser";

export type ParsedInbound = {
  fromEmail: string;
  fromName: string | null;
  toEmail: string | null;
  subject: string;
  bodyText: string;
  sentAt: Date;
  gmailMessageId: string | null;
  hasCommAssistHeader: boolean;
};

export type MailFields = {
  fromEmail: string;
  fromName?: string | null;
  toEmail?: string | null;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  date?: Date | string | null;
  messageId?: string | null;
  headers?: Record<string, string | string[] | undefined>;
};

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function displayNameFrom(fromName: string | null, fromEmail: string): string {
  const name = fromName?.trim();
  if (name) {
    return name;
  }
  const local = fromEmail.split("@")[0]?.trim();
  return local || fromEmail;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function headerHasCommAssist(headers: Record<string, string | string[] | undefined> | undefined): boolean {
  if (!headers) {
    return false;
  }
  const raw = headers["x-commassist"] ?? headers["X-CommAssist"];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values.some((value) => value.trim() === "1");
}

function parsedMailHeaders(mail: ParsedMail): Record<string, string | string[] | undefined> {
  const headers: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of mail.headers) {
    if (typeof value === "string") {
      headers[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      headers[key] = value.map(String);
      continue;
    }
    if (value != null) {
      headers[key] = String(value);
    }
  }
  return headers;
}

export function parseMailFields(fields: MailFields): ParsedInbound {
  const fromEmail = normalizeEmail(fields.fromEmail);
  if (!fromEmail || !fromEmail.includes("@")) {
    throw new Error("В письме нет отправителя");
  }

  const text = fields.text?.trim() || (fields.html ? htmlToText(fields.html) : "");
  const sentAt = fields.date ? new Date(fields.date) : new Date();

  return {
    fromEmail,
    fromName: fields.fromName?.trim() || null,
    toEmail: fields.toEmail ? normalizeEmail(fields.toEmail) : null,
    subject: fields.subject?.trim() || "(без темы)",
    bodyText: text,
    sentAt: Number.isNaN(sentAt.getTime()) ? new Date() : sentAt,
    gmailMessageId: fields.messageId?.trim() || null,
    hasCommAssistHeader: headerHasCommAssist(fields.headers),
  };
}

function firstAddress(
  value: ParsedMail["from"] | ParsedMail["to"],
): { address?: string; name?: string } | undefined {
  if (!value) {
    return undefined;
  }
  const list = Array.isArray(value) ? value : [value];
  return list[0]?.value[0];
}

export function parseParsedMail(mail: ParsedMail): ParsedInbound {
  const from = firstAddress(mail.from);
  const to = firstAddress(mail.to);
  return parseMailFields({
    fromEmail: from?.address ?? "",
    fromName: from?.name,
    toEmail: to?.address,
    subject: mail.subject,
    text: mail.text,
    html: typeof mail.html === "string" ? mail.html : null,
    date: mail.date,
    messageId: mail.messageId,
    headers: parsedMailHeaders(mail),
  });
}

export async function parseEml(source: Source): Promise<ParsedInbound> {
  return parseParsedMail(await simpleParser(source));
}

export function skipReason(
  parsed: ParsedInbound,
  managerEmail: string,
): "self" | "header" | null {
  if (parsed.hasCommAssistHeader) {
    return "header";
  }
  if (parsed.fromEmail === normalizeEmail(managerEmail)) {
    return "self";
  }
  return null;
}

export function clipBody(text: string, max = 80): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) {
    return oneLine;
  }
  return `${oneLine.slice(0, max)}…`;
}
