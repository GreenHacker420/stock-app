const DEFAULT_SOCKET_GRACE_MS = 3000;
const DEFAULT_MESSAGING_WINDOW_HOURS = 24;

const DEFAULT_MEDIA_POLICY = {
  image: { maxBytes: 5 * 1024 * 1024, mimeTypes: ["image/jpeg", "image/png"] },
  video: { maxBytes: 16 * 1024 * 1024, mimeTypes: ["video/mp4", "video/3gpp"] },
  audio: { maxBytes: 16 * 1024 * 1024, mimeTypes: ["audio/aac", "audio/amr", "audio/mpeg", "audio/mp4", "audio/ogg"] },
  document: { maxBytes: 100 * 1024 * 1024, mimeTypes: [] as string[] },
  sticker: { maxBytes: 1024 * 1024, mimeTypes: ["image/webp"] },
};

let socketGraceMs = DEFAULT_SOCKET_GRACE_MS;
let messagingWindowHours = DEFAULT_MESSAGING_WINDOW_HOURS;
let mediaPolicy = DEFAULT_MEDIA_POLICY;

export function setWhatsAppRuntimeConfig(config?: {
  socketGraceMs?: number | null;
  messagingWindowHours?: number | null;
  mediaPolicy?: Partial<typeof DEFAULT_MEDIA_POLICY>;
}) {
  const next = Number(config?.socketGraceMs);
  socketGraceMs = Number.isFinite(next)
    ? Math.min(Math.max(next, 0), 30_000)
    : DEFAULT_SOCKET_GRACE_MS;
  const nextWindow = Number(config?.messagingWindowHours);
  messagingWindowHours = Number.isFinite(nextWindow)
    ? Math.min(Math.max(nextWindow, 1), 72)
    : DEFAULT_MESSAGING_WINDOW_HOURS;
  mediaPolicy = {
    ...DEFAULT_MEDIA_POLICY,
    ...config?.mediaPolicy,
  };
}

export function getWhatsAppSocketGraceMs() {
  return socketGraceMs;
}

export function getWhatsAppMessagingWindowHours() {
  return messagingWindowHours;
}

export function getWhatsAppMediaRule(kind: keyof typeof DEFAULT_MEDIA_POLICY) {
  return mediaPolicy[kind] || DEFAULT_MEDIA_POLICY[kind];
}
