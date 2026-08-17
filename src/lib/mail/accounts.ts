export type MailboxCode = "M36" | "M52" | "M65";

export type MailboxAccount = {
  code: MailboxCode;
  email: string;
  password: string;
};

const MAILBOXES: Array<{ code: MailboxCode; emailEnv: string; passwordEnv: string }> = [
  { code: "M36", emailEnv: "GMAIL_M36_EMAIL", passwordEnv: "GMAIL_M36_APP_PASSWORD" },
  { code: "M52", emailEnv: "GMAIL_M52_EMAIL", passwordEnv: "GMAIL_M52_APP_PASSWORD" },
  { code: "M65", emailEnv: "GMAIL_M65_EMAIL", passwordEnv: "GMAIL_M65_APP_PASSWORD" },
];

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function loadMailboxAccounts(): {
  ready: MailboxAccount[];
  skipped: MailboxCode[];
} {
  const ready: MailboxAccount[] = [];
  const skipped: MailboxCode[] = [];

  for (const box of MAILBOXES) {
    const email = readEnv(box.emailEnv);
    const password = readEnv(box.passwordEnv);
    if (!email || !password) {
      skipped.push(box.code);
      continue;
    }
    ready.push({ code: box.code, email: email.toLowerCase(), password });
  }

  return { ready, skipped };
}

export function imapSettings(): { host: string; port: number } {
  return {
    host: readEnv("IMAP_HOST") || "imap.gmail.com",
    port: Number(readEnv("IMAP_PORT") || "993"),
  };
}

export function imapPollMs(): number {
  const seconds = Number(readEnv("IMAP_POLL_SECONDS") || "15");
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : 15) * 1000;
}
