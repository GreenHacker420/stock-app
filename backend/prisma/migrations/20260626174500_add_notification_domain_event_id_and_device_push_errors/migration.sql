-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "domainEventId" TEXT;

-- AlterTable
ALTER TABLE "UserDevice" ADD COLUMN "lastPushError" TEXT,
ADD COLUMN "pushDisabledAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_domainEventId_userId_key" ON "Notification"("domainEventId", "userId");
