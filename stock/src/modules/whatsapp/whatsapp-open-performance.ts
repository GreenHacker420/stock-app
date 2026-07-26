let activeOpen: {
  conversationId: string;
  startedAt: number;
} | null = null;
let listStartedAt: number | null = null;

export function startWhatsAppListMeasurement() {
  listStartedAt = performance.now();
  console.info("[WA_LIST_PERF] phase=tab-tap elapsed=0");
}

export function markWhatsAppListMeasurement(phase: string, detail = "") {
  if (listStartedAt == null) return;
  const elapsed = Math.round(performance.now() - listStartedAt);
  console.info(
    `[WA_LIST_PERF] phase=${phase} elapsed=${elapsed}${detail ? ` ${detail}` : ""}`,
  );
}

export function startWhatsAppOpenMeasurement(conversationId: string) {
  activeOpen = {
    conversationId,
    startedAt: performance.now(),
  };
  console.info(`[WA_OPEN_PERF] phase=tap conversation=${conversationId} elapsed=0`);
}

export function markWhatsAppOpenMeasurement(
  conversationId: string,
  phase: string,
  detail = "",
) {
  if (activeOpen?.conversationId !== conversationId) return;
  const elapsed = Math.round(performance.now() - activeOpen.startedAt);
  console.info(
    `[WA_OPEN_PERF] phase=${phase} conversation=${conversationId} elapsed=${elapsed}${detail ? ` ${detail}` : ""}`,
  );
}
