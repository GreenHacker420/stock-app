import type { DomainEvent } from "../../realtime/domainEvents";
import type { WaConversation, WaMessage } from "../../api/whatsapp.api";

export type WhatsAppBenchmarkFixture = {
  conversations: WaConversation[];
  messages: WaMessage[];
  rapidStatusEvents: DomainEvent[];
  duplicateAndMissingEvents: DomainEvent[];
  appStateSequence: Array<"active" | "inactive" | "background">;
  networkProfiles: Array<{
    name: "weak" | "high-latency";
    latencyMs: number;
    jitterMs: number;
    packetLossPercent: number;
  }>;
};

export function createWhatsAppBenchmarkFixture(): WhatsAppBenchmarkFixture {
  const baseTime = Date.parse("2026-07-23T00:00:00.000Z");
  const conversations = Array.from({ length: 1000 }, (_, index): WaConversation => ({
    id: `benchmark-conversation-${String(index).padStart(4, "0")}`,
    shopId: "benchmark-shop",
    phone: `919000${String(index).padStart(6, "0")}`,
    contactName: `Benchmark Contact ${index + 1}`,
    unreadCount: index % 7,
    isArchived: index % 19 === 0,
    isPinned: index < 3,
    entityVersion: 1,
    lastCustomerMessageAt: new Date(baseTime + index * 1000).toISOString(),
  }));

  const messages = Array.from({ length: 10_000 }, (_, index): WaMessage => {
    const messageType = (["TEXT", "IMAGE", "DOCUMENT", "AUDIO", "VIDEO"] as const)[index % 5];
    return {
      id: `benchmark-message-${String(index).padStart(5, "0")}`,
      clientMessageId: index % 2 === 0 ? `benchmark-client-${index}` : undefined,
      conversationId: conversations[index % conversations.length].id,
      direction: index % 3 === 0 ? "OUTBOUND" : "INBOUND",
      status: index % 11 === 0 ? "READ" : "DELIVERED",
      operationState: "COMPLETED",
      providerStatus: index % 11 === 0 ? "READ" : "DELIVERED",
      contentState: "VISIBLE",
      attempt: 1,
      entityVersion: 3,
      type: messageType,
      content: messageType === "TEXT"
        ? { text: `Deterministic benchmark message ${index + 1}` }
        : { caption: `Benchmark ${messageType.toLowerCase()} ${index + 1}` },
      createdAt: new Date(baseTime + index * 250).toISOString(),
    };
  });

  const rapidStatusEvents = Array.from({ length: 300 }, (_, index): DomainEvent => ({
    eventId: `benchmark-event-${index}`,
    sequence: String(index + 1),
    eventVersion: 1,
    shopId: "benchmark-shop",
    integrationId: "benchmark-integration",
    phoneNumberId: "benchmark-phone-number",
    conversationId: messages[index].conversationId,
    entity: "waMessage",
    entityId: messages[index].id,
    entityVersion: index + 4,
    action: "provider_status_changed",
    actorUserId: "system:whatsapp",
    occurredAt: new Date(baseTime + index).toISOString(),
    patch: {
      providerStatus: index % 2 === 0 ? "DELIVERED" : "READ",
      providerStatusAt: new Date(baseTime + index).toISOString(),
      attempt: 1,
      entityVersion: index + 4,
    },
  }));

  return {
    conversations,
    messages,
    rapidStatusEvents,
    duplicateAndMissingEvents: [
      rapidStatusEvents[0],
      rapidStatusEvents[0],
      ...rapidStatusEvents.slice(2, 20),
    ],
    appStateSequence: [
      "active", "inactive", "active", "inactive", "background",
      "active", "background", "active",
    ],
    networkProfiles: [
      { name: "weak", latencyMs: 800, jitterMs: 400, packetLossPercent: 8 },
      { name: "high-latency", latencyMs: 1800, jitterMs: 250, packetLossPercent: 1 },
    ],
  };
}
