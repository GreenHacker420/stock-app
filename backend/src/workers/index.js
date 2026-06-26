import { startInboundWorker } from "./whatsapp/inbound.worker.js";
import { startOutboundWorker } from "./whatsapp/outbound.worker.js";
import { startBroadcastDispatcherWorker } from "./whatsapp/broadcast-dispatcher.worker.js";
import { startBroadcastSendWorker } from "./whatsapp/broadcast-send.worker.js";
import { startMediaDownloadWorker } from "./whatsapp/media-download.worker.js";
import { startNotificationPushWorker } from "./notification-push.worker.js";
import { startDomainEventDispatcherWorker } from "./domain-event-dispatcher.worker.js";

/**
 * Initializes and starts all WhatsApp background queue workers.
 */
export async function startAllWorkers() {
  console.log("[Workers Registry] Initializing all WhatsApp queue workers...");

  try {
    const inbound = startInboundWorker();
    const outbound = startOutboundWorker();
    const dispatcher = startBroadcastDispatcherWorker();
    const sender = startBroadcastSendWorker();
    const downloader = startMediaDownloadWorker();
    const notificationPush = startNotificationPushWorker();
    const domainEvents = startDomainEventDispatcherWorker();

    console.log("[Workers Registry] All background workers started successfully.");
    
    return {
      inbound,
      outbound,
      dispatcher,
      sender,
      downloader,
      notificationPush,
      domainEvents,
    };
  } catch (error) {
    console.error("[Workers Registry] Failed to start background workers:", error.message);
    throw error;
  }
}
