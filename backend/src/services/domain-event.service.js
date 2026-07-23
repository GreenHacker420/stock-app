import crypto from "node:crypto";

export const DOMAIN_EVENT_SOCKET_NAME = "domain:event";

const DEFAULT_QUERY_KEYS = {
  sale: ["sales", "dashboard", "customers", "payments", "items", "stock"],
  payment: ["payments", "dashboard", "customers", "cashSessions"],
  stock: ["items", "stock", "dashboard"],
  item: ["items", "stock", "dashboard"],
  category: ["items", "categories", "stock"],
  customer: ["customers"],
  deliveryMemo: ["deliveryMemos", "dashboard", "customers"],
  order: ["orders", "dashboard"],
  cashSession: ["cashSession", "dashboard"],
  approval: ["approvals", "notifications"],
  notification: ["notifications"],
  dashboard: ["dashboard"],
  shop: ["shops"],
  staff: ["staff", "shops"],
  attendance: ["attendance", "dashboard"],
  expense: ["expenses", "dashboard", "cashSession"],
  dailySummary: ["dailySummary", "dashboard"],
};

export function createDomainEvent({
  eventId,
  tenantId = null,
  shopId,
  entity,
  action,
  entityId,
  actorUserId,
  actorRole,
  sourceDeviceId = null,
  idempotencyKey = null,
  serverVersion,
  eventVersion = 1,
  entityVersion,
  integrationId = null,
  phoneNumberId = null,
  conversationId = null,
  visibility = { owners: true, staff: true },
  queryKeys,
  patch,
  notification,
}) {
  if (!shopId) throw new Error("Domain event requires shopId");
  if (!entity) throw new Error("Domain event requires entity");
  if (!action) throw new Error("Domain event requires action");
  if (!entityId) throw new Error("Domain event requires entityId");
  if (!actorUserId) throw new Error("Domain event requires actorUserId");

  return {
    eventId: eventId || `evt_${crypto.randomUUID()}`,
    tenantId,
    shopId,
    entity,
    action,
    entityId,
    actorUserId,
    actorRole,
    sourceDeviceId,
    idempotencyKey,
    serverVersion,
    eventVersion,
    entityVersion,
    integrationId,
    phoneNumberId,
    conversationId,
    occurredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    visibility: {
      owners: visibility.owners !== false,
      staff: visibility.staff !== false,
      targetUserIds: visibility.targetUserIds || undefined,
      targetDeviceIds: visibility.targetDeviceIds || undefined,
    },
    queryKeys: queryKeys || DEFAULT_QUERY_KEYS[entity] || [entity],
    patch,
    notification,
  };
}

export async function allocateShopEventSequence(tx, shopId) {
  const rows = await tx.$queryRaw`
    INSERT INTO "ShopEventSequence" ("shopId", "value") VALUES (${shopId}, 1)
    ON CONFLICT ("shopId") DO UPDATE SET "value" = "ShopEventSequence"."value" + 1
    RETURNING "value"
  `;
  return rows[0].value;
}

export async function enqueueDomainEvent(tx, eventInput) {
  const event = eventInput.eventId ? eventInput : createDomainEvent(eventInput);
  const sequence = await allocateShopEventSequence(tx, event.shopId);
  const sequencedEvent = {
    ...event,
    sequence: sequence.toString(),
  };
  await tx.domainEventOutbox.create({
    data: {
      id: sequencedEvent.eventId,
      tenantId: sequencedEvent.tenantId || null,
      shopId: sequencedEvent.shopId,
      entity: sequencedEvent.entity,
      action: sequencedEvent.action,
      entityId: sequencedEvent.entityId,
      eventJson: sequencedEvent,
      status: "pending",
      sequence,
    },
  });
  return sequencedEvent;
}

export async function enqueueManyDomainEvents(tx, events) {
  const created = [];
  for (const event of events) {
    created.push(await enqueueDomainEvent(tx, event));
  }
  return created;
}
