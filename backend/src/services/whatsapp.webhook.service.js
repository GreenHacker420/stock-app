import crypto from "crypto";
import prisma from "../lib/db.js";
import { processWhatsAppEvent } from "./whatsapp.processor.js";
import { parseWebhookPayload, splitWebhookPayload } from "./whatsapp.webhook-parser.js";
import { processManagementWebhook } from "./whatsapp.management.service.js";

const MANAGEMENT_FIELDS = new Set([
  "message_template_status_update",
  "template_status_update",
  "message_template_quality_update",
  "template_quality_update",
  "phone_number_quality_update",
  "phone_number_name_update",
  "business_capability_update",
  "account_review_update",
  "account_update",
  "account_alerts",
]);

function hashPayload(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

export async function persistWebhookEnvelopes({ payload, shopId, signatureVerified }) {
  const changes = splitWebhookPayload(payload);
  const envelopes = [];

  for (const change of changes) {
    const payloadHash = hashPayload(change.payload);
    const envelope = await prisma.waWebhookEnvelope.upsert({
      where: {
        shopId_payloadHash: {
          shopId,
          payloadHash,
        },
      },
      update: {},
      create: {
        shopId,
        wabaId: change.wabaId,
        phoneNumberId: change.phoneNumberId,
        field: change.field,
        payloadJson: change.payload,
        payloadHash,
        signatureVerified,
      },
    });

    envelopes.push(envelope);
  }

  return envelopes;
}

export async function processWebhookEnvelope(envelopeId) {
  const envelope = await prisma.waWebhookEnvelope.update({
    where: { id: envelopeId },
    data: {
      processingStatus: "PROCESSING",
      attemptCount: { increment: 1 },
      errorCode: null,
      errorMessage: null,
    },
  });

  const isMessagesField = envelope.field === "messages";
  const isManagementField = MANAGEMENT_FIELDS.has(envelope.field);

  if (!isMessagesField && !isManagementField) {
    return prisma.waWebhookEnvelope.update({
      where: { id: envelope.id },
      data: {
        processingStatus: "QUARANTINED",
        processedAt: new Date(),
        errorCode: "UNSUPPORTED_WEBHOOK_FIELD",
        errorMessage: `No handler registered for webhook field: ${envelope.field}`,
      },
    });
  }

  try {
    if (isMessagesField) {
      const events = parseWebhookPayload(envelope.payloadJson);
      for (const event of events) {
        await processWhatsAppEvent(event, envelope.shopId);
      }
    } else {
      await processManagementWebhook(envelope);
    }

    return await prisma.$transaction(async (tx) => {
      await tx.waIntegration.updateMany({
        where: { shopId: envelope.shopId },
        data: { lastWebhookAt: envelope.receivedAt },
      });

      return tx.waWebhookEnvelope.update({
        where: { id: envelope.id },
        data: {
          processingStatus: "PROCESSED",
          processedAt: new Date(),
        },
      });
    });
  } catch (error) {
    await prisma.waWebhookEnvelope.update({
      where: { id: envelope.id },
      data: {
        processingStatus: "FAILED",
        errorCode: error.code || "WEBHOOK_PROCESSING_FAILED",
        errorMessage: error.message,
      },
    });
    throw error;
  }
}
