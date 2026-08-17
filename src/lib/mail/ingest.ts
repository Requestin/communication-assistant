import { Prisma, type PrismaClient } from "@prisma/client";
import {
  clipBody,
  displayNameFrom,
  normalizeEmail,
  skipReason,
  type ParsedInbound,
} from "./parse";

export type IngestInput = {
  managerId: string;
  managerEmail: string;
  gmailUid: string;
  parsed: ParsedInbound;
};

export type IngestResult =
  | { status: "created"; messageId: string; conversationId: string; clientId: string }
  | { status: "duplicate" }
  | { status: "skipped"; reason: "self" | "header" };

export async function ingestInbound(
  prisma: PrismaClient,
  input: IngestInput,
): Promise<IngestResult> {
  const reason = skipReason(input.parsed, input.managerEmail);
  if (reason) {
    return { status: "skipped", reason };
  }

  const managerEmail = normalizeEmail(input.managerEmail);
  const fromEmail = input.parsed.fromEmail;
  const toEmail = input.parsed.toEmail ?? managerEmail;
  const displayName = displayNameFrom(input.parsed.fromName, fromEmail);
  const subject = input.parsed.subject;
  const sentAt = input.parsed.sentAt;

  try {
    return await prisma.$transaction(async (tx) => {
      const client = await tx.client.upsert({
        where: { managerId_email: { managerId: input.managerId, email: fromEmail } },
        create: {
          managerId: input.managerId,
          email: fromEmail,
          displayName,
        },
        update: { displayName },
      });

      const existing = await tx.conversation.findUnique({
        where: { managerId_clientId: { managerId: input.managerId, clientId: client.id } },
      });

      const lastMessageAt =
        existing && existing.lastMessageAt > sentAt ? existing.lastMessageAt : sentAt;

      const conversation = await tx.conversation.upsert({
        where: { managerId_clientId: { managerId: input.managerId, clientId: client.id } },
        create: {
          managerId: input.managerId,
          clientId: client.id,
          subject,
          lastMessageAt: sentAt,
        },
        update: { subject, lastMessageAt },
      });

      const message = await tx.message.create({
        data: {
          conversationId: conversation.id,
          direction: "inbound",
          fromEmail,
          toEmail,
          subject,
          bodyText: input.parsed.bodyText,
          sentAt,
          gmailUid: input.gmailUid,
          gmailMessageId: input.parsed.gmailMessageId,
        },
      });

      return {
        status: "created" as const,
        messageId: message.id,
        conversationId: conversation.id,
        clientId: client.id,
      };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: "duplicate" };
    }
    throw error;
  }
}

export function ingestLogLine(input: IngestInput, result: IngestResult): string {
  const from = input.parsed.fromEmail;
  const subject = input.parsed.subject;
  const preview = clipBody(input.parsed.bodyText);
  if (result.status === "created") {
    return `inbound uid=${input.gmailUid} from=${from} subject=${subject} preview=${preview}`;
  }
  if (result.status === "duplicate") {
    return `skip duplicate uid=${input.gmailUid} from=${from}`;
  }
  return `skip ${result.reason} uid=${input.gmailUid} from=${from}`;
}
