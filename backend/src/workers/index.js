import { startNotificationPushWorker } from "./notification-push.worker.js";
import { startDomainEventDispatcherWorker } from "./domain-event-dispatcher.worker.js";

/**
 * Initializes and starts background queue workers.
 */
export async function startAllWorkers({ whatsappEnabled = false } = {}) {
  console.log("[Workers Registry] Initializing background queue workers...");

  try {
    const notificationPush = startNotificationPushWorker();
    const domainEvents = startDomainEventDispatcherWorker();
    const workers = { notificationPush, domainEvents };

    if (whatsappEnabled) {
      const [
        { startInboundWorker },
        { startOutboundWorker },
        { startBroadcastDispatcherWorker },
        { startBroadcastSendWorker },
        { startMediaDownloadWorker },
      ] = await Promise.all([
        import("./whatsapp/inbound.worker.js"),
        import("./whatsapp/outbound.worker.js"),
        import("./whatsapp/broadcast-dispatcher.worker.js"),
        import("./whatsapp/broadcast-send.worker.js"),
        import("./whatsapp/media-download.worker.js"),
      ]);

      workers.inbound = startInboundWorker();
      workers.outbound = startOutboundWorker();
      workers.dispatcher = startBroadcastDispatcherWorker();
      workers.sender = startBroadcastSendWorker();
      workers.downloader = startMediaDownloadWorker();
    }

    console.log("[Workers Registry] All background workers started successfully.");
    return workers;
  } catch (error) {
    console.error("[Workers Registry] Failed to start background workers:", error.message);
    throw error;
  }
}
