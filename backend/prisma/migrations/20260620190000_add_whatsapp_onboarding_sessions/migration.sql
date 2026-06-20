CREATE TYPE "WaOnboardingStatus" AS ENUM (
  'CREATED',
  'AUTHORIZED',
  'ASSETS_DISCOVERED',
  'APP_SUBSCRIBED',
  'NUMBER_REGISTERED',
  'CONNECTED',
  'ACTION_REQUIRED',
  'FAILED',
  'CANCELLED',
  'EXPIRED'
);

CREATE TYPE "WaOnboardingMode" AS ENUM ('CLOUD_API', 'COEXISTENCE');

ALTER TABLE "WaIntegration"
ADD COLUMN "businessPortfolioId" TEXT,
ADD COLUMN "tokenType" TEXT,
ADD COLUMN "tokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "grantedScopes" JSONB,
ADD COLUMN "tokenLastValidatedAt" TIMESTAMP(3),
ADD COLUMN "onboardingMode" "WaOnboardingMode",
ADD COLUMN "reauthorizationRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "disconnectedAt" TIMESTAMP(3);

CREATE TABLE "WaOnboardingSession" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "initiatedById" TEXT NOT NULL,
  "status" "WaOnboardingStatus" NOT NULL DEFAULT 'CREATED',
  "mode" "WaOnboardingMode" NOT NULL DEFAULT 'CLOUD_API',
  "configId" TEXT NOT NULL,
  "graphVersion" TEXT NOT NULL DEFAULT 'v25.0',
  "stateNonceHash" TEXT NOT NULL,
  "businessTokenEncrypted" TEXT,
  "tokenType" TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "grantedScopes" JSONB,
  "businessPortfolioId" TEXT,
  "wabaId" TEXT,
  "phoneNumberId" TEXT,
  "finishEvent" TEXT,
  "currentStep" TEXT,
  "metaSessionId" TEXT,
  "sessionInfo" JSONB,
  "completedSteps" JSONB,
  "verifyToken" TEXT,
  "registrationPinEncrypted" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "lastAttemptAt" TIMESTAMP(3),
  "authorizedAt" TIMESTAMP(3),
  "subscribedAt" TIMESTAMP(3),
  "registeredAt" TIMESTAMP(3),
  "connectedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WaOnboardingSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WaOnboardingSession_shopId_status_createdAt_idx"
ON "WaOnboardingSession"("shopId", "status", "createdAt");

CREATE INDEX "WaOnboardingSession_initiatedById_createdAt_idx"
ON "WaOnboardingSession"("initiatedById", "createdAt");

CREATE INDEX "WaOnboardingSession_expiresAt_idx"
ON "WaOnboardingSession"("expiresAt");

ALTER TABLE "WaOnboardingSession"
ADD CONSTRAINT "WaOnboardingSession_shopId_fkey"
FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WaOnboardingSession"
ADD CONSTRAINT "WaOnboardingSession_initiatedById_fkey"
FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
