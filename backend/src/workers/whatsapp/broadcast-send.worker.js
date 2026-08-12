import { DelayedError, UnrecoverableError, Worker } from "bullmq";
import axios from "axios";
import prisma from "../../lib/db.js";
import { getWaCredentials } from "../../lib/wa-cache.js";
import { connection } from "../../services/whatsapp.queue.js";
import { reserveWhatsAppSendSlot } from "../../services/whatsapp.rate-limit.js";
import { enqueueWhatsAppDomainEvent } from "../../services/whatsapp.domain-events.js";
import { publishWhatsAppEvent } from "../../utils/realtime.js";

const API_VERSION = "v25.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;
const PROGRESS_TTL_SECONDS = 7 * 24 * 60 * 60;
const BINDING_PLAN_TTL_MS = 5 * 60 * 1000;
const bindingPlanCache = new Map();

function recipientValue(value, recipient) {
  if (value == null) return "";
  const name = recipient.customerName || recipient.customerPhone;
  return String(value)
    .replaceAll("{{recipient.name}}", name)
    .replaceAll("{{recipient.phone}}", recipient.customerPhone);
}

function getPath(source, path) {
  if (!source || !path) return undefined;
  return path.split(".").reduce((value, key) => value?.[key], source);
}

function formatAttributeValue(value, type) {
  if (value == null || value === "") return "";
  if (type === "CURRENCY") {
    const number = Number(value);
    return Number.isFinite(number)
      ? number.toLocaleString("en-IN", { style: "currency", currency: "INR" })
      : String(value);
  }
  if (type === "DATE") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-IN");
  }
  if (type === "DATETIME") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-IN");
  }
  if (type === "BOOLEAN") return value ? "Yes" : "No";
  return String(value);
}

function headerFormat(template) {
  const components = Array.isArray(template.components) ? template.components : [];
  return components.find((component) => String(component?.type || "").toUpperCase() === "HEADER")?.format?.toUpperCase();
}

function buttonSubType(template, buttonIndex) {
  const components = Array.isArray(template.components) ? template.components : [];
  const buttons = components.find((component) => String(component?.type || "").toUpperCase() === "BUTTONS")?.buttons || [];
  return String(buttons[buttonIndex]?.type || "URL").toLowerCase();
}

async function resolveHeaderMedia(broadcast, template) {
  const variables = broadcast.templateVariables || {};
  const assetId = variables.headerAssetId;
  const format = headerFormat(template);
  if (!assetId || !["IMAGE", "VIDEO", "DOCUMENT"].includes(format)) return null;

  const asset = await prisma.asset.findFirst({
    where: {
      id: assetId,
      shopId: broadcast.shopId,
      status: "READY",
      kind: format,
    },
    select: {
      externalProvider: true,
      externalId: true,
      fileName: true,
    },
  });
  if (!asset?.externalId || asset.externalProvider !== "META_WHATSAPP") {
    throw new UnrecoverableError("Broadcast header media is not available in WhatsApp");
  }

  const type = format.toLowerCase();
  return {
    type,
    [type]: {
      id: asset.externalId,
      ...(format === "DOCUMENT"
        ? { filename: variables.headerFileName || asset.fileName || "document" }
        : {}),
    },
  };
}

async function getBindingPlan(broadcast) {
  const bindings = Array.isArray(broadcast.templateVariables?.bindings)
    ? broadcast.templateVariables.bindings
    : [];
  if (!bindings.length) return null;

  const cached = bindingPlanCache.get(broadcast.id);
  if (cached && Date.now() - cached.loadedAt < BINDING_PLAN_TTL_MS) return cached;

  const attributeIds = [...new Set(
    bindings
      .filter((binding) => binding?.mode === "ATTRIBUTE" && typeof binding.attributeId === "string")
      .map((binding) => binding.attributeId),
  )];

  const [attributes, shop] = await Promise.all([
    attributeIds.length
      ? prisma.waTemplateAttribute.findMany({
          where: {
            id: { in: attributeIds },
            shopId: broadcast.shopId,
            isActive: true,
          },
          select: {
            id: true,
            source: true,
            sourcePath: true,
            type: true,
            fallbackValue: true,
            label: true,
          },
        })
      : Promise.resolve([]),
    prisma.shop.findUnique({
      where: { id: broadcast.shopId },
      select: { id: true, name: true, phone: true, address: true, email: true, city: true, gstin: true },
    }),
  ]);

  const plan = {
    loadedAt: Date.now(),
    bindings,
    attributes: new Map(attributes.map((attribute) => [attribute.id, attribute])),
    shop,
  };
  bindingPlanCache.set(broadcast.id, plan);
  return plan;
}

async function buildBindingContext(broadcast, recipient, conversation, plan) {
  const customer = recipient.customerId
    ? await prisma.customer.findFirst({
        where: { id: recipient.customerId, shopId: broadcast.shopId },
      })
    : null;

  // Name/phone are always present in the immutable campaign recipient snapshot,
  // so device-only contacts can still use the common Customer name/phone sources.
  const customerContext = {
    ...(customer || {}),
    name: customer?.name || recipient.customerName || recipient.customerPhone,
    phone: customer?.phone || recipient.customerPhone,
  };

  return {
    CUSTOMER: customerContext,
    CONVERSATION: {
      ...conversation,
      contactName: conversation?.contactName || recipient.customerName || recipient.customerPhone,
      phone: conversation?.phone || recipient.customerPhone,
    },
    SHOP: plan?.shop || null,
  };
}

function resolveRuntimeBinding(binding, recipient, plan, context) {
  if (!binding || !binding.mode) return "";

  if (binding.mode === "FIXED") {
    return recipientValue(binding.value || binding.fallbackValue || "", recipient).trim();
  }

  const attribute = plan?.attributes.get(binding.attributeId);
  if (!attribute) {
    return recipientValue(binding.fallbackValue || "", recipient).trim();
  }

  const source = context[attribute.source];
  const resolved = formatAttributeValue(getPath(source, attribute.sourcePath), attribute.type);
  return recipientValue(
    resolved || binding.fallbackValue || attribute.fallbackValue || "",
    recipient,
  ).trim();
}

async function buildTemplatePayload(broadcast, template, recipient, conversation) {
  const variables = broadcast.templateVariables || {};
  const components = [];
  const mediaParameter = await resolveHeaderMedia(broadcast, template);
  const plan = await getBindingPlan(broadcast);

  if (plan) {
    const context = await buildBindingContext(broadcast, recipient, conversation, plan);
    const resolved = plan.bindings.map((binding) => ({
      ...binding,
      resolvedValue: resolveRuntimeBinding(binding, recipient, plan, context),
    }));

    const missing = resolved.find((binding) => !binding.resolvedValue);
    if (missing) {
      throw new UnrecoverableError(
        `No value could be resolved for ${missing.component} {{${missing.position}}}`,
      );
    }

    const headerBindings = resolved
      .filter((binding) => binding.component === "HEADER")
      .sort((left, right) => left.position - right.position);
    const bodyBindings = resolved
      .filter((binding) => binding.component === "BODY")
      .sort((left, right) => left.position - right.position);
    const buttonBindings = resolved
      .filter((binding) => binding.component === "BUTTON")
      .sort((left, right) => (left.buttonIndex ?? 0) - (right.buttonIndex ?? 0) || left.position - right.position);
    const cardBindings = resolved.filter((binding) => binding.component === "CARD");

    if (cardBindings.length) {
      throw new UnrecoverableError("Carousel runtime bindings are not enabled for broadcasts yet");
    }

    if (mediaParameter) {
      components.push({ type: "header", parameters: [mediaParameter] });
    } else if (headerBindings.length) {
      components.push({
        type: "header",
        parameters: headerBindings.map((binding) => ({ type: "text", text: binding.resolvedValue })),
      });
    }

    if (bodyBindings.length) {
      components.push({
        type: "body",
        parameters: bodyBindings.map((binding) => ({ type: "text", text: binding.resolvedValue })),
      });
    }

    for (const binding of buttonBindings) {
      const index = binding.buttonIndex ?? 0;
      const subType = buttonSubType(template, index);
      if (subType !== "url") {
        throw new UnrecoverableError(`Runtime ${subType} button bindings are not enabled for broadcasts yet`);
      }
      components.push({
        type: "button",
        sub_type: "url",
        index: String(index),
        parameters: [{ type: "text", text: binding.resolvedValue }],
      });
    }
  } else {
    // Backwards compatibility for broadcasts created before runtime bindings.
    if (mediaParameter) {
      components.push({ type: "header", parameters: [mediaParameter] });
    } else if (Array.isArray(variables.header) && variables.header.length > 0) {
      components.push({
        type: "header",
        parameters: variables.header.map((value) => ({
          type: "text",
          text: recipientValue(value, recipient),
        })),
      });
    }

    if (Array.isArray(variables.body) && variables.body.length > 0) {
      components.push({
        type: "body",
        parameters: variables.body.map((value) => ({
          type: "text",
          text: recipientValue(value, recipient),
        })),
      });
    }
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient.customerPhone.replace(/^\+/, ""),
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      ...(components.length > 0 ? { components } : {}),
    },
  };
}

async function ensureConversation(broadcast, integration, recipient) {
  const conversation = await prisma.waConversation.upsert({
    where: {
      integrationId_phone: {
        integrationId: integration.id,
        phone: recipient.customerPhone,
      },
    },
    create: {
      shopId: integration.shopId,
      integrationId: integration.id,
      contextShopId: broadcast.shopId,
      phone: recipient.customerPhone,
      contactName: recipient.customerName || null,
      customerId: integration.shopId === broadcast.shopId ? recipient.customerId : null,
      unreadCount: 0,
    },
    update: { contextShopId: broadcast.shopId },
  });

  if (recipient.customerId) {
    await prisma.waConversationCustomerLink.upsert({
      where: {
        conversationId_shopId: {
          conversationId: conversation.id,
          shopId: broadcast.shopId,
        },
      },
      create: {
        conversationId: conversation.id,
        shopId: broadcast.shopId,
        customerId: recipient.customerId,
      },
      update: { customerId: recipient.customerId },
    });
  }

  return conversation;
}

function broadcastMessagePatch(message) {
  return {
    id: message.id,
    clientMessageId: message.clientMessageId,
    conversationId: message.conversationId,
    metaMessageId: message.metaMessageId,
    operationState: message.operationState,
    providerStatus: message.providerStatus,
    providerStatusAt: message.providerStatusAt,
    contentState: message.contentState,
    attempt: message.attempt,
    entityVersion: message.entityVersion,
    direction: message.direction,
    type: message.type,
    content: message.content,
    assetId: message.assetId,
    templateId: message.templateId,
    templateName: message.templateName,
    templateLanguage: message.templateLanguage,
    errorMessage: message.errorMessage,
    createdAt: message.createdAt,
  };
}

async function enqueueBroadcastMessageEvent(tx, {
  broadcast,
  integration,
  credentials,
  conversation,
  recipient,
  message,
}) {
  if (!broadcast || !integration || !credentials || !conversation || !message) return;
  await enqueueWhatsAppDomainEvent(tx, {
    shopId: broadcast.shopId,
    integration: {
      id: integration.id,
      phoneNumberId: credentials.phoneNumberId,
    },
    entity: "waMessage",
    entityId: message.id,
    entityVersion: message.entityVersion,
    action: "created",
    conversationId: conversation.id,
    actorUserId: broadcast.createdById || "system:whatsapp",
    idempotencyKey: `wa-broadcast-message:${broadcast.id}:${recipient.id}:created`,
    patch: broadcastMessagePatch(message),
  });
}

async function syncBroadcastProgress(broadcastId) {
  const counts = await prisma.waBroadcastRecipient.groupBy({
    by: ["status"],
    where: { broadcastId },
    _count: { id: true },
  });
  const byStatus = Object.fromEntries(counts.map((entry) => [entry.status, entry._count.id]));
  const remaining = byStatus.PENDING || 0;
  const data = {
    sentCount: (byStatus.SENT || 0) + (byStatus.DELIVERED || 0) + (byStatus.READ || 0),
    deliveredCount: (byStatus.DELIVERED || 0) + (byStatus.READ || 0),
    readCount: byStatus.READ || 0,
    failedCount: byStatus.FAILED || 0,
    skippedCount: byStatus.SKIPPED || 0,
    ...(remaining === 0 ? { status: "COMPLETED", completedAt: new Date() } : {}),
  };

  await prisma.waBroadcast.updateMany({
    where: { id: broadcastId, status: "SENDING" },
    data,
  });

  if (remaining === 0) {
    await connection.del(`broadcast:${broadcastId}:remaining`);
    bindingPlanCache.delete(broadcastId);
  } else {
    await connection.set(
      `broadcast:${broadcastId}:remaining`,
      remaining,
      "EX",
      PROGRESS_TTL_SECONDS,
    );
  }
}

async function recordTerminalFailure({
  broadcast,
  integration,
  credentials,
  recipient,
  conversation,
  errorMessage,
}) {
  await prisma.$transaction(async (tx) => {
    const transitioned = await tx.waBroadcastRecipient.updateMany({
      where: { id: recipient.id, status: "PENDING" },
      data: {
        status: "FAILED",
        errorMessage,
      },
    });
    // A stop/cancel can mark a recipient SKIPPED while an in-flight worker is
    // unwinding. Never resurrect that terminal operator decision as FAILED.
    if (!transitioned.count) return;

    if (!broadcast?.template || !conversation) return;

    const failedMessage = await tx.waMessage.upsert({
      where: {
        conversationId_clientMessageId: {
          conversationId: conversation.id,
          clientMessageId: `broadcast:${broadcast.id}:${recipient.id}`,
        },
      },
      create: {
        conversationId: conversation.id,
        contextShopId: broadcast.shopId,
        clientMessageId: `broadcast:${broadcast.id}:${recipient.id}`,
        direction: "OUTBOUND",
        status: "FAILED",
        operationState: "TERMINALLY_FAILED",
        providerStatus: "FAILED",
        providerStatusAt: new Date(),
        type: "TEMPLATE",
        content: { template: { name: broadcast.template.name, language: broadcast.template.language } },
        templateId: broadcast.template.id,
        templateName: broadcast.template.name,
        templateLanguage: broadcast.template.language,
        broadcastRecipientId: recipient.id,
        errorMessage,
        failedAt: new Date(),
      },
      update: {
        status: "FAILED",
        operationState: "TERMINALLY_FAILED",
        providerStatus: "FAILED",
        providerStatusAt: new Date(),
        broadcastRecipientId: recipient.id,
        errorMessage,
        failedAt: new Date(),
        entityVersion: { increment: 1 },
      },
    });

    await enqueueBroadcastMessageEvent(tx, {
      broadcast,
      integration,
      credentials,
      conversation,
      recipient,
      message: failedMessage,
    });
  });
}

export function startBroadcastSendWorker() {
  const worker = new Worker(
    "whatsapp-broadcast-send",
    async (job, token) => {
      const { broadcastId, recipientId } = job.data;
      const recipient = await prisma.waBroadcastRecipient.findFirst({
        where: { id: recipientId, broadcastId },
      });

      if (!recipient) {
        console.warn(`[Broadcast Send] Recipient ${recipientId} not found for ${broadcastId}`);
        await syncBroadcastProgress(broadcastId);
        return;
      }
      if (["SENT", "DELIVERED", "READ", "FAILED", "SKIPPED"].includes(recipient.status)) {
        await syncBroadcastProgress(broadcastId);
        return;
      }

      let broadcast;
      let conversation;
      let integration;
      let credentials;
      try {
        broadcast = await prisma.waBroadcast.findUnique({
          where: { id: broadcastId },
          include: { template: true },
        });
        if (!broadcast || broadcast.status !== "SENDING") {
          await connection.del(`broadcast:${broadcastId}:remaining`);
          bindingPlanCache.delete(broadcastId);
          return;
        }
        if (!broadcast.template) {
          throw new UnrecoverableError("Broadcast template is unavailable");
        }

        integration = broadcast.integrationId
          ? await prisma.waIntegration.findUnique({
              where: { id: broadcast.integrationId },
              select: { id: true, shopId: true, status: true },
            })
          : await prisma.waIntegration.findUnique({
              where: { shopId: broadcast.shopId },
              select: { id: true, shopId: true, status: true },
            });
        if (!integration || integration.status !== "CONNECTED") {
          throw new UnrecoverableError("WhatsApp integration is not connected");
        }

        credentials = await getWaCredentials(integration.shopId);
        if (!credentials || credentials.id !== integration.id) {
          throw new UnrecoverableError("WhatsApp credentials are unavailable for the broadcast integration");
        }

        const waitMs = await reserveWhatsAppSendSlot(
          integration.shopId,
          `broadcast:${job.id}`,
        );
        if (waitMs > 0) {
          await job.moveToDelayed(Date.now() + waitMs, token);
          throw new DelayedError();
        }

        conversation = await ensureConversation(broadcast, integration, recipient);
        const payload = await buildTemplatePayload(broadcast, broadcast.template, recipient, conversation);

        // Stop/cancel can happen while the worker is waiting on the shared rate
        // limit or resolving live attributes. Re-check both authoritative rows at
        // the final provider boundary so a queued recipient does not leak through
        // after the operator has stopped pending sends.
        const [liveBroadcast, liveRecipient] = await Promise.all([
          prisma.waBroadcast.findUnique({
            where: { id: broadcastId },
            select: { status: true },
          }),
          prisma.waBroadcastRecipient.findUnique({
            where: { id: recipient.id },
            select: { status: true },
          }),
        ]);
        if (liveBroadcast?.status !== "SENDING" || liveRecipient?.status !== "PENDING") {
          await syncBroadcastProgress(broadcastId);
          return;
        }

        const response = await axios.post(
          `${BASE_URL}/${credentials.phoneNumberId}/messages`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${credentials.accessToken}`,
              "Content-Type": "application/json",
            },
          },
        );
        const metaMessageId = response.data.messages?.[0]?.id;
        if (!metaMessageId) throw new Error("WhatsApp did not return a message id");
        const now = new Date();

        const message = await prisma.$transaction(async (tx) => {
          await tx.waBroadcastRecipient.update({
            where: { id: recipient.id },
            data: {
              status: "SENT",
              metaMessageId,
              sentAt: now,
              errorMessage: null,
            },
          });

          const savedMessage = await tx.waMessage.upsert({
            where: {
              conversationId_clientMessageId: {
                conversationId: conversation.id,
                clientMessageId: `broadcast:${broadcast.id}:${recipient.id}`,
              },
            },
            create: {
              conversationId: conversation.id,
              contextShopId: broadcast.shopId,
              clientMessageId: `broadcast:${broadcast.id}:${recipient.id}`,
              metaMessageId,
              direction: "OUTBOUND",
              status: "SENT",
              operationState: "COMPLETED",
              providerStatus: "SENT",
              providerStatusAt: now,
              type: "TEMPLATE",
              content: { template: { name: broadcast.template.name, language: broadcast.template.language } },
              payload: { broadcastId: broadcast.id },
              templateId: broadcast.template.id,
              templateName: broadcast.template.name,
              templateLanguage: broadcast.template.language,
              broadcastRecipientId: recipient.id,
              createdAt: now,
            },
            update: {
              metaMessageId,
              status: "SENT",
              operationState: "COMPLETED",
              providerStatus: "SENT",
              providerStatusAt: now,
              broadcastRecipientId: recipient.id,
              errorMessage: null,
              failedAt: null,
              entityVersion: { increment: 1 },
            },
          });

          await enqueueBroadcastMessageEvent(tx, {
            broadcast,
            integration,
            credentials,
            conversation,
            recipient,
            message: savedMessage,
          });
          return savedMessage;
        });

        // Keep the legacy low-latency event for older clients. The durable domain
        // event written above is authoritative for replay/reconciliation.
        await publishWhatsAppEvent(broadcast.shopId, "wa:status_updated", {
          messageId: message.id,
          conversationId: conversation.id,
          status: "SENT",
        });
        await syncBroadcastProgress(broadcast.id);
      } catch (error) {
        if (error instanceof DelayedError) throw error;

        const errorMessage = error.response?.data?.error?.message || error.message || "Broadcast send failed";
        const maxAttempts = job.opts.attempts || 3;
        const terminalAttempt = error instanceof UnrecoverableError
          || job.attemptsMade + 1 >= maxAttempts;
        console.error(
          `[Broadcast Send] recipient ${recipient.id} failed (${job.attemptsMade + 1}/${maxAttempts}):`,
          errorMessage,
        );

        if (!terminalAttempt) {
          const stillPending = await prisma.waBroadcastRecipient.updateMany({
            where: { id: recipient.id, status: "PENDING" },
            data: { errorMessage },
          });
          if (!stillPending.count) {
            await syncBroadcastProgress(broadcastId);
            return;
          }
          throw error;
        }

        await recordTerminalFailure({
          broadcast,
          integration,
          credentials,
          recipient,
          conversation,
          errorMessage,
        });
        await syncBroadcastProgress(broadcastId);
      }
    },
    {
      connection,
      concurrency: 10,
    },
  );

  worker.on("completed", (job) => {
    console.log(`[Broadcast Send] Job ${job.id} completed`);
  });

  worker.on("failed", (job, error) => {
    console.error(`[Broadcast Send] Job ${job?.id} scheduled for retry or failed:`, error.message);
  });

  return worker;
}