export function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (isProduction()) {
    throw new Error("JWT_SECRET is required in production");
  }
  return "dev-secret";
}

export function getCorsOrigin() {
  const origin = process.env.CORS_ORIGIN;
  if (origin) return origin;
  if (isProduction()) {
    throw new Error("CORS_ORIGIN is required in production");
  }
  return "*";
}

export function isWhatsAppEnabled() {
  if (process.env.WHATSAPP_ENABLED === "false") return false;
  if (process.env.WHATSAPP_ENABLED === "true") return true;
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_APP_ID);
}
