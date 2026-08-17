import nodemailer from "nodemailer";
import { clipBody } from "./parse";
import { findMailboxAccount, smtpSettings } from "./accounts";

export type SmtpSendInput = {
  fromEmail: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  inReplyTo?: string | null;
};

export type SmtpSendResult = {
  smtpMessageId: string | null;
};

export type SmtpTransport = {
  sendMail: (options: {
    from: string;
    to: string;
    subject: string;
    text: string;
    headers: Record<string, string>;
  }) => Promise<{ messageId?: string }>;
};

export class SmtpSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmtpSendError";
  }
}

let transportOverride: SmtpTransport | null = null;

export function setSmtpTransportForTests(transport: SmtpTransport | null): void {
  transportOverride = transport;
}

export function replySubject(subject: string): string {
  const trimmed = subject.trim() || "(без темы)";
  if (/^re:\s/i.test(trimmed)) {
    return trimmed;
  }
  return `Re: ${trimmed}`;
}

function createLiveTransport(fromEmail: string): SmtpTransport {
  const account = findMailboxAccount(fromEmail);
  if (!account) {
    throw new SmtpSendError("Нет пароля приложения для этого ящика");
  }
  const { host, port } = smtpSettings();
  return nodemailer.createTransport({
    host,
    port,
    secure: false,
    requireTLS: true,
    auth: { user: account.email, pass: account.password },
  });
}

export async function sendManagerReply(input: SmtpSendInput): Promise<SmtpSendResult> {
  const headers: Record<string, string> = { "X-CommAssist": "1" };
  if (input.inReplyTo) {
    headers["In-Reply-To"] = input.inReplyTo;
    headers.References = input.inReplyTo;
  }

  const transport = transportOverride ?? createLiveTransport(input.fromEmail);
  try {
    const sent = await transport.sendMail({
      from: input.fromEmail,
      to: input.toEmail,
      subject: input.subject,
      text: input.bodyText,
      headers,
    });
    console.info(
      `[smtp] from=${input.fromEmail} to=${input.toEmail} subject=${input.subject} preview=${clipBody(input.bodyText)}`,
    );
    return { smtpMessageId: sent.messageId ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const safe = message.replace(/password[=:]\s*\S+/gi, "password=***");
    console.error(`[smtp] failed from=${input.fromEmail} to=${input.toEmail}: ${safe}`);
    throw new SmtpSendError("Не удалось отправить письмо");
  }
}
