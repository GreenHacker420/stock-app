import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { enqueueWhatsAppDomainEvent } from "./whatsapp.domain-events.js";

export async function linkWhatsAppConversationCustomer({
  shopId,
  integration,
  conversation,
  customerId,
  actorUserId,
  sourceDeviceId = null,
}) {
  const customer = customerId
    ? await prisma.customer.findFirst({
        where: {
          id: customerId,
          shopId,
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          phone: true,
        },
      })
    : null;

  if (customerId && !customer) {
    throw new ApiError(404, "Customer not found for this shop", {
      code: "CUSTOMER_NOT_FOUND",
    });
  }

  return prisma.$transaction(async (tx) => {
    if (customer) {
      await tx.waConversationCustomerLink.upsert({
        where: {
          conversationId_shopId: {
            conversationId: conversation.id,
            shopId,
          },
        },
        create: {
          conversationId: conversation.id,
          shopId,
          customerId: customer.id,
        },
        update: { customerId: customer.id },
      });
    } else {
      await tx.waConversationCustomerLink.deleteMany({
        where: {
          conversationId: conversation.id,
          shopId,
        },
      });
    }

    const row = await tx.waConversation.update({
      where: { id: conversation.id },
      data: {
        ...(shopId === integration.shopId
          ? { customerId: customer?.id || null }
          : {}),
        entityVersion: { increment: 1 },
      },
    });

    const projected = {
      ...row,
      // Customer links are scoped to the active shop even when the underlying
      // WhatsApp conversation belongs to a shared integration owner.
      customerId: customer?.id || null,
      customer,
    };

    await enqueueWhatsAppDomainEvent(tx, {
      shopId,
      integration,
      entity: "waConversation",
      entityId: row.id,
      entityVersion: row.entityVersion,
      action: customer ? "customer_linked" : "customer_unlinked",
      conversationId: row.id,
      actorUserId,
      sourceDeviceId,
      patch: {
        customerId: customer?.id || null,
        customer,
        entityVersion: row.entityVersion,
        updatedAt: row.updatedAt,
      },
    });

    return projected;
  });
}
