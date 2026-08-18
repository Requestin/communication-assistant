import type { Job, PrismaClient } from "@prisma/client";
import { isTransientLlmError } from "@/lib/ai/llm";
import { processEvaluateQuality } from "@/lib/ai/quality";

const MAX_ATTEMPTS = 3;

type ClaimedJob = Pick<
  Job,
  "id" | "type" | "status" | "conversationId" | "messageId" | "payload" | "error" | "attempts"
>;

export async function claimNextQualityJob(prisma: PrismaClient): Promise<ClaimedJob | null> {
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE jobs
    SET
      status = CAST('processing' AS "JobStatus"),
      "startedAt" = NOW(),
      attempts = attempts + 1
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = CAST('pending' AS "JobStatus")
        AND type = CAST('evaluate_quality' AS "JobType")
        AND attempts < ${MAX_ATTEMPTS}
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING
      id,
      type,
      status,
      "conversationId",
      "messageId",
      payload,
      error,
      attempts
  `;
  return rows[0] ?? null;
}

function jobErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/password[=:]\s*\S+/gi, "password=***").slice(0, 500);
  }
  return "job failed";
}

export async function processNextQualityJob(prisma: PrismaClient): Promise<boolean> {
  const job = await claimNextQualityJob(prisma);
  if (!job) {
    return false;
  }

  try {
    await processEvaluateQuality(prisma, job);
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "done", finishedAt: new Date(), error: null },
    });
  } catch (error) {
    const requeue = job.attempts < MAX_ATTEMPTS && isTransientLlmError(error);
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: requeue ? "pending" : "failed",
        error: jobErrorMessage(error),
        finishedAt: requeue ? null : new Date(),
        startedAt: requeue ? null : undefined,
      },
    });
  }

  return true;
}
