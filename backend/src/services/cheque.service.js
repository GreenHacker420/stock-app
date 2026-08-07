import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { notifyShopOwner, createNotification } from "./notification.service.js";
import { EntityType } from "../generated/prisma/index.js";
import { reverseLedgerEntry } from "./customer-ledger.service.js";
import { createDomainEvent, enqueueDomainEvent } from "./domain-event.service.js";
import { verifyPayment } from "./payment.service.js";
import {
  recomputeLinkedDocumentPaymentState,
} from "./payment-accounting.service.js";

async function getChequePayment(user, id) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { details: true, customer: true, sale: true, deliveryMemo: true, order: true },
  });
  if (!payment || payment.paymentMode !== "CHEQUE") throw new ApiError(404, "Cheque payment not found");
  await assertShopAccess(user, payment.shopId);
  return payment;
}

export async function listCheques(user, { shopId, status }) {
  if (shopId) await assertShopAccess(user, shopId);
  const shopIds = shopId ? [shopId] : await accessibleShopIds(user);

  return prisma.payment.findMany({
    where: {
      shopId: { in: shopIds },
      paymentMode: "CHEQUE",
      details: { chequeStatus: status || undefined },
    },
    include: { details: true, customer: true, receivedBy: { select: { id: true, name: true } } },
    orderBy: { receivedAt: "desc" },
  });
}

async function accessibleShopIds(user) {
  if (user.role === "OWNER") {
    const shops = await prisma.shop.findMany({ where: { ownerId: user.id }, select: { id: true } });
    return shops.map((shop) => shop.id);
  }
  const accesses = await prisma.staffShopAccess.findMany({ where: { staffId: user.id }, select: { shopId: true } });
  return accesses.map((access) => access.shopId);
}

export async function getCheque(user, id) {
  return getChequePayment(user, id);
}

/**
 * Cheque state machine:
 * RECEIVED → DEPOSITED → CLEARED
 *         ↘ BOUNCED / RETURNED / CANCELLED (terminal)
 * Cleared cheques may bounce post-clearance (business-allowed).
 */
export async function updateChequeStatus(user, id, status, { reason } = {}) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
  const existing = await getChequePayment(user, id);
  const existingChequeStatus = existing.details?.chequeStatus || "RECEIVED";
  if (existingChequeStatus === status) return existing;

  const terminal = ["BOUNCED", "RETURNED", "CANCELLED"];
  if (terminal.includes(existingChequeStatus) && status !== "BOUNCED") {
    throw new ApiError(400, `Cheque is already ${existingChequeStatus.toLowerCase()}`);
  }

  // Clearing uses authoritative payment verification (ledger + allocation + recompute)
  if (status === "CLEARED") {
    if (["REJECTED", "CANCELLED"].includes(existing.status)) {
      throw new ApiError(400, `Cannot clear a ${existing.status.toLowerCase()} cheque payment`);
    }
    if (!["RECEIVED", "DEPOSITED"].includes(existingChequeStatus) && existingChequeStatus !== "CLEARED") {
      throw new ApiError(400, `Cannot clear cheque from status ${existingChequeStatus}`);
    }

    // Update cheque detail first, then verify payment through shared path
    await prisma.paymentDetail.upsert({
      where: { paymentId: id },
      update: { chequeStatus: "CLEARED" },
      create: { paymentId: id, chequeStatus: "CLEARED" },
    });

    if (existing.status === "VERIFIED") {
      return getChequePayment(user, id);
    }

    // verifyPayment posts PAYMENT_RECEIVED + allocates + recomputes
    await verifyPayment(user, id, { note: reason || "Cheque cleared" });
    return getChequePayment(user, id);
  }

  // Bounce before clearance: no ledger mutation
  // Bounce after clearance (VERIFIED): reverse payment credit
  if (status === "BOUNCED") {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${id} FOR UPDATE`;

      const customer = existing.customerId
        ? await tx.customer.findUnique({ where: { id: existing.customerId } })
        : null;

      await tx.paymentDetail.upsert({
        where: { paymentId: id },
        update: { chequeStatus: "BOUNCED" },
        create: { paymentId: id, chequeStatus: "BOUNCED" },
      });

      const wasVerified = existing.status === "VERIFIED";

      const payment = await tx.payment.update({
        where: { id },
        data: {
          status: "REJECTED",
          verifiedById: user.id,
          verifiedAt: new Date(),
          notes: reason || existing.notes,
        },
        include: { details: true, customer: true },
      });

      if (wasVerified && customer && customer.type !== "WALK_IN") {
        const originalCredit = await tx.customerLedgerEntry.findFirst({
          where: {
            shopId: existing.shopId,
            sourceType: "PAYMENT",
            sourceId: existing.id,
            entryType: "PAYMENT_RECEIVED",
          },
        });
        if (originalCredit) {
          await reverseLedgerEntry(tx, {
            shopId: existing.shopId,
            entryId: originalCredit.id,
            reversalReason: `Cheque bounced: ${reason || "Bounced"}`,
            createdById: user.id,
          });
        }
        await recomputeLinkedDocumentPaymentState(tx, {
          saleId: existing.saleId,
          dmId: existing.dmId,
          orderId: existing.orderId,
        });
      }

      const msg = `Cheque bounced for customer ${customer?.name || existing.customer?.name || "Walk-In"} for ₹${existing.amount}`;
      await notifyShopOwner(tx, {
        shopId: existing.shopId,
        triggerEvent: "CHEQUE_BOUNCED",
        entityType: EntityType.PAYMENT,
        entityId: id,
        message: msg,
      });

      if (existing.receivedById) {
        await createNotification(tx, {
          userId: existing.receivedById,
          shopId: existing.shopId,
          triggerEvent: "CHEQUE_BOUNCED",
          entityType: EntityType.PAYMENT,
          entityId: id,
          message: `${msg}. Please follow up for payment.`,
        });
      }

      await enqueueDomainEvent(tx, createDomainEvent({
        shopId: existing.shopId,
        entity: "payment",
        action: "updated",
        entityId: id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }));

      return payment;
    });
  }

  // DEPOSITED / RETURNED / CANCELLED — status-only transitions
  return prisma.$transaction(async (tx) => {
    const details = await tx.paymentDetail.upsert({
      where: { paymentId: id },
      update: { chequeStatus: status },
      create: { paymentId: id, chequeStatus: status },
    });

    const paymentData = {
      notes: reason || existing.notes,
    };
    if (status === "CANCELLED") {
      paymentData.status = "CANCELLED";
    } else if (status === "RETURNED") {
      paymentData.status = existing.status === "VERIFIED" ? existing.status : "REJECTED";
    }

    const payment = await tx.payment.update({
      where: { id },
      data: paymentData,
      include: { details: true, customer: true },
    });

    await writeAuditLog({
      userId: user.id,
      shopId: existing.shopId,
      action: status,
      entityType: "PAYMENT",
      entityId: id,
      oldValueJson: existing.details,
      newValueJson: details,
      reason,
    });

    await enqueueDomainEvent(tx, createDomainEvent({
      shopId: existing.shopId,
      entity: "payment",
      action: "updated",
      entityId: id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true },
    }));

    return payment;
  });
}
