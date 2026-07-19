type JwtPayload = {
  exp?: number;
};

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;

    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(globalThis.atob(paddedBase64)) as JwtPayload;
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string, nowMs = Date.now(), clockAllowanceSeconds = 30): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return true;

  return nowMs >= (payload.exp - clockAllowanceSeconds) * 1000;
}
