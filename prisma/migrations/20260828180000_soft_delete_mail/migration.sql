-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "messages" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ai_notes" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "conversations_deletedAt_idx" ON "conversations"("deletedAt");

-- CreateIndex
CREATE INDEX "messages_conversationId_deletedAt_idx" ON "messages"("conversationId", "deletedAt");

-- CreateIndex
CREATE INDEX "ai_notes_conversationId_deletedAt_idx" ON "ai_notes"("conversationId", "deletedAt");
