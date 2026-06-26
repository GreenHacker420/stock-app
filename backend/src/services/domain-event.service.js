import crypto from "node:crypto";

export const DOMAIN_EVENT_SOCKET_NAME = "domain:event";

const DEFAULT_QUERY_KEYS = {
  sale: ["sales", "dashboard", "customers", "payments", "items", "stock"],
  payment: ["payments", "dashboard", "customers", "cashSessions"],
  stock: ["items", "stock", "dashboard"],
  item: ["items", "stock", "dashboard"],
  customer: ["customers"],
  deliveryMemo: ["deliveryMemos", "dashboard", "customers"],
  order: ["orders", "dashboard"],
  cashSession: ["cashSession", "dashboard"],
  approval: ["approvals", "notifications"],
  notification: ["notifications"],
  dashboard: ["dashboard"],
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

export async function enqueueDomainEvent(tx, eventInput) {
  const event = eventInput.eventId ? eventInput : createDomainEvent(eventInput);
  await tx.domainEventOutbox.create({
    data: {
      id: event.eventId,
      tenantId: event.tenantId || null,
      shopId: event.shopId,
      entity: event.entity,
      action: event.action,
      entityId: event.entityId,
      eventJson: event,
      status: "pending",
    },
  });
  return event;
}

export async function enqueueManyDomainEvents(tx, events) {
  const created = [];
  for (const event of events) {
    created.push(await enqueueDomainEvent(tx, event));
  }
  return created;
}
