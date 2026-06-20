CREATE TYPE "PushDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'TEST_NOTIFICATION';

CREATE TABLE "NotificationPushDelivery" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "status" "PushDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "provider" TEXT NOT NULL DEFAULT 'EXPO',
  "ticketId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationPushDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationPushDelivery_notificationId_deviceId_key"
ON "NotificationPushDelivery"("notificationId", "deviceId");

CREATE INDEX "NotificationPushDelivery_status_createdAt_idx"
ON "NotificationPushDelivery"("status", "createdAt");

CREATE INDEX "NotificationPushDelivery_deviceId_createdAt_idx"
ON "NotificationPushDelivery"("deviceId", "createdAt");

ALTER TABLE "NotificationPushDelivery"
ADD CONSTRAINT "NotificationPushDelivery_notificationId_fkey"
FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationPushDelivery"
ADD CONSTRAINT "NotificationPushDelivery_deviceId_fkey"
FOREIGN KEY ("deviceId") REFERENCES "UserDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
