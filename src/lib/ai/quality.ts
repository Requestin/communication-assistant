import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma, type Job, type Message, type PrismaClient } from "@prisma/client";
import { completeJson } from "@/lib/ai/llm";
import { clipBody } from "@/lib/mail/parse";

export type QualityJson = {
  literacy: number;
  spelling: number;
  punctuation: number;
  businessStyle: number;
  overall: number;
  issues: string[];
  hint: string;
  showHint: boolean;
};

const CONTEXT_MESSAGES = 6;
const CONTEXT_CLIP = 1500;
const LETTER_CLIP = 8000;

export class QualityParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QualityParseError";
  }
}

export function loadQualitySystemPrompt(): string {
  return readFileSync(join(process.cwd(), "prompts/quality-system.md"), "utf8").trim();
}

function asIntScore(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
    throw new QualityParseError(`${field} must be an integer 1–5`);
  }
  return value;
}

export function computeOverall(
  literacy: number,
  spelling: number,
  punctuation: number,
  businessStyle: number,
): number {
  return Math.round(((literacy + spelling + punctuation + businessStyle) / 4) * 10) / 10;
}

export function allCriteriaAtLeastFour(
  literacy: number,
  spelling: number,
  punctuation: number,
  businessStyle: number,
): boolean {
  return literacy >= 4 && spelling >= 4 && punctuation >= 4 && businessStyle >= 4;
}

export function computeShowHint(
  scores: Pick<QualityJson, "literacy" | "spelling" | "punctuation" | "businessStyle" | "overall" | "issues">,
): boolean {
  if (allCriteriaAtLeastFour(scores.literacy, scores.spelling, scores.punctuation, scores.businessStyle)) {
    return false;
  }
  return (
    scores.literacy <= 3 ||
    scores.spelling <= 3 ||
    scores.punctuation <= 3 ||
    scores.businessStyle <= 3 ||
    scores.overall < 4 ||
    scores.issues.length > 0
  );
}

export function parseQualityJson(input: unknown): QualityJson {
  if (!input || typeof input !== "object") {
    throw new QualityParseError("quality JSON must be an object");
  }
  const raw = input as Record<string, unknown>;
  const literacy = asIntScore(raw.literacy, "literacy");
  const spelling = asIntScore(raw.spelling, "spelling");
  const punctuation = asIntScore(raw.punctuation, "punctuation");
  const businessStyle = asIntScore(raw.businessStyle, "businessStyle");
  const issuesRaw = Array.isArray(raw.issues)
    ? raw.issues.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const hintRaw = typeof raw.hint === "string" ? raw.hint.trim() : "";
  const overall = computeOverall(literacy, spelling, punctuation, businessStyle);
  const silent = allCriteriaAtLeastFour(literacy, spelling, punctuation, businessStyle);
  const issues = silent ? [] : issuesRaw;
  const hint = silent ? "" : hintRaw;
  const showHint = computeShowHint({
    literacy,
    spelling,
    punctuation,
    businessStyle,
    overall,
    issues,
  });
  return { literacy, spelling, punctuation, businessStyle, overall, issues, hint, showHint };
}

export function buildQualityUserPrompt(outbound: Message, thread: Message[]): string {
  const context = thread
    .slice(-CONTEXT_MESSAGES)
    .map((item) => {
      const label = item.direction === "outbound" ? "outbound" : "inbound";
      const body = item.bodyText.length > CONTEXT_CLIP ? `${item.bodyText.slice(0, CONTEXT_CLIP)}…` : item.bodyText;
      return `[${label} ${item.sentAt.toISOString()}] ${body}`;
    })
    .join("\n");
  const letter =
    outbound.bodyText.length > LETTER_CLIP ? `${outbound.bodyText.slice(0, LETTER_CLIP)}…` : outbound.bodyText;
  return [
    "Оцени последнее письмо менеджера.",
    "",
    `Тема: ${outbound.subject}`,
    "",
    "Письмо менеджера:",
    '"""',
    letter,
    '"""',
    "",
    "Контекст ленты (не оценивать письма клиента):",
    context || "(нет предыдущих писем)",
  ].join("\n");
}

export function formatHintBody(score: QualityJson): string {
  return score.hint.trim();
}

export async function processEvaluateQuality(
  prisma: PrismaClient,
  job: Pick<Job, "id" | "conversationId" | "messageId">,
): Promise<void> {
  if (!job.messageId) {
    throw new Error("job has no messageId");
  }

  const message = await prisma.message.findUnique({
    where: { id: job.messageId },
    include: { conversation: { select: { managerId: true } } },
  });
  if (!message) {
    throw new Error("message not found");
  }
  if (message.direction !== "outbound") {
    throw new Error("inbound not scored");
  }

  const existing = await prisma.qualityScore.findUnique({ where: { messageId: message.id } });
  if (existing) {
    return;
  }

  const recent = await prisma.message.findMany({
    where: { conversationId: message.conversationId },
    orderBy: { sentAt: "desc" },
    take: CONTEXT_MESSAGES,
  });
  const thread = [...recent].reverse();

  const raw = await completeJson<unknown>(
    loadQualitySystemPrompt(),
    buildQualityUserPrompt(message, thread),
    "quality",
  );
  const score = parseQualityJson(raw);
  console.info(
    `[quality] message=${message.id} overall=${score.overall} showHint=${score.showHint} preview=${clipBody(message.bodyText)}`,
  );

  try {
    await prisma.$transaction(async (tx) => {
      await tx.qualityScore.create({
        data: {
          messageId: message.id,
          managerId: message.conversation.managerId,
          literacy: score.literacy,
          spelling: score.spelling,
          punctuation: score.punctuation,
          businessStyle: score.businessStyle,
          overall: score.overall,
          issues: score.issues,
          showHint: score.showHint,
        },
      });
      if (score.showHint) {
        await tx.aiNote.create({
          data: {
            conversationId: message.conversationId,
            messageId: message.id,
            type: "quality_hint",
            title: "Подсказка по качеству",
            body: formatHintBody(score),
            payload: score,
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }
    throw error;
  }
}
