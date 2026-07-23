const DEFAULT_SOCKET_GRACE_MS = 3000;

let socketGraceMs = DEFAULT_SOCKET_GRACE_MS;

export function setWhatsAppRuntimeConfig(config?: { socketGraceMs?: number | null }) {
  const next = Number(config?.socketGraceMs);
  socketGraceMs = Number.isFinite(next)
    ? Math.min(Math.max(next, 0), 30_000)
    : DEFAULT_SOCKET_GRACE_MS;
}

export function getWhatsAppSocketGraceMs() {
  return socketGraceMs;
}
