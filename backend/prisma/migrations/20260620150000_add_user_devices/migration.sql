CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

CREATE TABLE "UserDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "pushToken" TEXT,
    "nativePushToken" TEXT,
    "voipToken" TEXT,
    "appVersion" TEXT,
    "buildVersion" TEXT,
    "deviceName" TEXT,
    "osVersion" TEXT,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "voipEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastShopId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserDevice_userId_installationId_key"
ON "UserDevice"("userId", "installationId");

CREATE INDEX "UserDevice_userId_revokedAt_lastSeenAt_idx"
ON "UserDevice"("userId", "revokedAt", "lastSeenAt");

CREATE INDEX "UserDevice_pushToken_idx" ON "UserDevice"("pushToken");
CREATE INDEX "UserDevice_nativePushToken_idx" ON "UserDevice"("nativePushToken");
CREATE INDEX "UserDevice_voipToken_idx" ON "UserDevice"("voipToken");

ALTER TABLE "UserDevice"
ADD CONSTRAINT "UserDevice_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
