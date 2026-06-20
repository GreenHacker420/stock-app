import crypto from "crypto";

function stateSecret() {
  return process.env.WHATSAPP_ONBOARDING_STATE_SECRET
    || process.env.MASTER_ENCRYPTION_KEY
    || process.env.JWT_SECRET
    || "dev-whatsapp-onboarding-state";
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function signature(value) {
  return crypto.createHmac("sha256", stateSecret()).update(value).digest("base64url");
}

export function createOnboardingState(sessionId, expiresAt) {
  const nonce = crypto.randomBytes(32).toString("base64url");
  const payload = `${sessionId}.${nonce}.${expiresAt.getTime()}`;
  return {
    state: `${payload}.${signature(payload)}`,
    nonceHash: digest(nonce),
  };
}

export function parseOnboardingState(state) {
  const parts = String(state || "").split(".");
  if (parts.length !== 4) throw new Error("Invalid onboarding state");
  const [sessionId, nonce, expiresAtValue, suppliedSignature] = parts;
  const payload = `${sessionId}.${nonce}.${expiresAtValue}`;
  const expected = signature(payload);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length
    || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid onboarding state");
  }
  const expiresAt = Number(expiresAtValue);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) throw new Error("Onboarding state expired");
  return { sessionId, nonce };
}

export function hashOnboardingNonce(nonce) {
  return digest(nonce);
}
