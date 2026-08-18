-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "threadKey" TEXT NOT NULL DEFAULT '(без темы)';

-- DropIndex
DROP INDEX "conversations_managerId_clientId_key";

-- CreateIndex
CREATE UNIQUE INDEX "conversations_managerId_clientId_threadKey_key" ON "conversations"("managerId", "clientId", "threadKey");

-- CreateIndex
CREATE INDEX "conversations_managerId_clientId_idx" ON "conversations"("managerId", "clientId");
