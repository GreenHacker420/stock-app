import { enqueueDomainEvent } from "./domain-event.service.js";

export async function enqueueWhatsAppDomainEvent(tx, {
  shopId,
  integration,
  entity,
  entityId,
  entityVersion,
  action,
  conversationId,
  sourceDeviceId = null,
  actorUserId = "system:whatsapp",
  idempotencyKey = null,
  patch,
  notification,
}) {
  const resolvedIntegration = integration || await tx.waIntegration.findUnique({
    where: { shopId },
    select: { id: true, phoneNumberId: true },
  });

  return enqueueDomainEvent(tx, {
    shopId,
    entity,
    entityId,
    entityVersion,
    action,
    actorUserId,
    sourceDeviceId,
    idempotencyKey,
    integrationId: resolvedIntegration?.id || null,
    phoneNumberId: resolvedIntegration?.phoneNumberId || null,
    conversationId,
    patch,
    notification,
  });
}
