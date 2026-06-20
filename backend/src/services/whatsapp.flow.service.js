import axios from "axios";
import crypto from "crypto";
import { z } from "zod";
import prisma from "../lib/db.js";
import { getWaCredentials } from "../lib/wa-cache.js";
import { whatsappService } from "./whatsapp.service.js";

const API_VERSION = "v25.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;
const FLOW_CATEGORIES = [
  "SIGN_UP",
  "SIGN_IN",
  "APPOINTMENT_BOOKING",
  "LEAD_GENERATION",
  "CONTACT_US",
  "CUSTOMER_SUPPORT",
  "SURVEY",
  "OTHER",
];
const FLOW_FIELDS = [
  "id",
  "name",
  "categories",
  "preview",
  "status",
  "validation_errors",
  "json_version",
  "data_api_version",
  "endpoint_uri",
  "health_status",
].join(",");

const flowInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  categories: z.array(z.enum(FLOW_CATEGORIES)).min(1).max(3),
  flowJson: z.union([z.string(), z.record(z.string(), z.any())]),
  endpointEnabled: z.boolean().optional().default(false),
  handlerKey: z.string().trim().max(100).optional().nullable(),
});

function normalizeStatus(status) {
  return ["DRAFT", "PUBLISHED", "DEPRECATED", "BLOCKED", "THROTTLED"].includes(status)
    ? status
    : "DRAFT";
}

function parseFlowJson(input) {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new Error(`Flow JSON is invalid: ${error.message}`);
  }
}

export function validateFlowJson(input) {
  const errors = [];
  let flowJson;
  try {
    flowJson = parseFlowJson(input);
  } catch (error) {
    return { valid: false, errors: [{ path: "$", message: error.message }] };
  }
  const size = Buffer.byteLength(JSON.stringify(flowJson));
  if (size > 10 * 1024 * 1024) errors.push({ path: "$", message: "Flow JSON must be 10 MB or smaller" });
  if (!flowJson || typeof flowJson !== "object" || Array.isArray(flowJson)) {
    errors.push({ path: "$", message: "Flow JSON must be an object" });
    return { valid: false, errors };
  }
  if (!flowJson.version || typeof flowJson.version !== "string") {
    errors.push({ path: "version", message: "Flow JSON version is required" });
  }
  if (!Array.isArray(flowJson.screens) || flowJson.screens.length === 0) {
    errors.push({ path: "screens", message: "At least one screen is required" });
    return { valid: false, errors, flowJson };
  }
  const ids = new Set();
  let terminalCount = 0;
  flowJson.screens.forEach((screen, index) => {
    const path = `screens[${index}]`;
    if (!screen?.id || typeof screen.id !== "string") errors.push({ path: `${path}.id`, message: "Screen ID is required" });
    else if (ids.has(screen.id)) errors.push({ path: `${path}.id`, message: "Screen IDs must be unique" });
    else ids.add(screen.id);
    if (!screen?.title || typeof screen.title !== "string") errors.push({ path: `${path}.title`, message: "Screen title is required" });
    if (screen?.terminal === true) terminalCount += 1;
    if (screen?.layout?.type !== "SingleColumnLayout" || !Array.isArray(screen?.layout?.children)) {
      errors.push({ path: `${path}.layout`, message: "Screens require a SingleColumnLayout with children" });
    }
  });
  if (terminalCount === 0) errors.push({ path: "screens", message: "At least one terminal screen is required" });
  if (flowJson.routing_model) {
    Object.entries(flowJson.routing_model).forEach(([screenId, targets]) => {
      if (!ids.has(screenId)) errors.push({ path: `routing_model.${screenId}`, message: "Routing source screen does not exist" });
      if (!Array.isArray(targets)) errors.push({ path: `routing_model.${screenId}`, message: "Routing targets must be an array" });
      else targets.forEach((target) => {
        if (!ids.has(target)) errors.push({ path: `routing_model.${screenId}`, message: `Routing target ${target} does not exist` });
      });
    });
  }
  return { valid: errors.length === 0, errors, flowJson };
}

function publicEndpointBase() {
  return (process.env.WHATSAPP_FLOW_ENDPOINT_BASE_URL || process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
}

function endpointUrl(endpointKey) {
  const base = publicEndpointBase();
  if (!base) throw new Error("WHATSAPP_FLOW_ENDPOINT_BASE_URL is required for endpoint-powered Flows");
  return `${base}/whatsapp/flow-endpoint/${endpointKey}`;
}

function metaHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}` };
}

async function getFlowOrThrow(shopId, id) {
  const flow = await prisma.waFlow.findFirst({ where: { id, shopId, deletedAt: null } });
  if (!flow) throw new Error("Flow not found");
  return flow;
}

async function fetchMetaFlow(flowId, accessToken, phoneNumberId) {
  const health = phoneNumberId
    ? `health_status.phone_number(${phoneNumberId})`
    : "health_status";
  const response = await axios.get(`${BASE_URL}/${flowId}`, {
    params: { fields: FLOW_FIELDS.replace("health_status", health) },
    headers: metaHeaders(accessToken),
  });
  return response.data;
}

function metaProjection(meta) {
  return {
    name: meta.name,
    status: normalizeStatus(meta.status),
    categories: meta.categories || [],
    validationErrors: meta.validation_errors || [],
    jsonVersion: meta.json_version,
    dataApiVersion: meta.data_api_version,
    endpointUrl: meta.endpoint_uri,
    endpointEnabled: Boolean(meta.endpoint_uri),
    endpointHealth: meta.health_status,
    previewUrl: meta.preview?.preview_url,
    previewExpiresAt: meta.preview?.expires_at ? new Date(meta.preview.expires_at) : null,
    rawMeta: meta,
    syncError: null,
    syncedAt: new Date(),
    ...(meta.status === "PUBLISHED" ? { publishedAt: new Date() } : {}),
    ...(meta.status === "DEPRECATED" ? { deprecatedAt: new Date() } : {}),
  };
}

class WhatsAppFlowService {
  async listFlows(shopId, query = {}) {
    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 20, 1), 100);
    const where = {
      shopId,
      deletedAt: null,
      ...(query.status && query.status !== "ALL" ? { status: query.status } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
    };
    const [data, total] = await prisma.$transaction([
      prisma.waFlow.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.waFlow.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async getFlow(shopId, id) {
    const flow = await prisma.waFlow.findFirst({
      where: { id, shopId, deletedAt: null },
      include: {
        executions: {
          orderBy: { startedAt: "desc" },
          take: 20,
          include: {
            conversation: { select: { contactName: true, phone: true } },
            customer: { select: { name: true } },
          },
        },
      },
    });
    if (!flow) throw new Error("Flow not found");
    return flow;
  }

  async createFlow(shopId, input) {
    const value = flowInputSchema.parse(input);
    const localValidation = validateFlowJson(value.flowJson);
    if (!localValidation.valid) return { validationErrors: localValidation.errors };
    const integration = await getWaCredentials(shopId);
    if (!integration) throw new Error("WhatsApp integration not connected");
    const endpointKey = crypto.randomUUID();
    const resolvedEndpointUrl = value.endpointEnabled ? endpointUrl(endpointKey) : undefined;
    const response = await axios.post(
      `${BASE_URL}/${integration.businessAccountId}/flows`,
      {
        name: value.name,
        categories: value.categories,
        flow_json: JSON.stringify(localValidation.flowJson),
        publish: false,
        ...(resolvedEndpointUrl ? { endpoint_uri: resolvedEndpointUrl } : {}),
        ...(resolvedEndpointUrl && process.env.WHATSAPP_APP_ID ? { application_id: process.env.WHATSAPP_APP_ID } : {}),
      },
      { headers: { ...metaHeaders(integration.accessToken), "Content-Type": "application/json" } },
    );
    const meta = await fetchMetaFlow(response.data.id, integration.accessToken, integration.phoneNumberId);
    return prisma.waFlow.create({
      data: {
        shopId,
        flowId: response.data.id,
        name: value.name,
        description: value.description,
        categories: value.categories,
        flowJson: localValidation.flowJson,
        endpointEnabled: value.endpointEnabled,
        endpointKey,
        endpointUrl: resolvedEndpointUrl,
        handlerKey: value.handlerKey,
        validationErrors: response.data.validation_errors || meta.validation_errors || [],
        deployedRevision: (response.data.validation_errors || []).length ? null : 1,
        ...metaProjection(meta),
      },
    });
  }

  async updateDraft(shopId, id, input) {
    const flow = await getFlowOrThrow(shopId, id);
    if (flow.status !== "DRAFT") throw new Error("Only draft Flows can be edited");
    const value = flowInputSchema.partial().parse(input);
    const nextJson = value.flowJson == null ? flow.flowJson : parseFlowJson(value.flowJson);
    const validation = validateFlowJson(nextJson);
    const endpointKey = flow.endpointKey || crypto.randomUUID();
    const endpointEnabled = value.endpointEnabled ?? flow.endpointEnabled;
    return prisma.waFlow.update({
      where: { id },
      data: {
        ...(value.name != null ? { name: value.name } : {}),
        ...(value.description !== undefined ? { description: value.description } : {}),
        ...(value.categories != null ? { categories: value.categories } : {}),
        ...(value.flowJson != null ? { flowJson: nextJson } : {}),
        endpointEnabled,
        endpointKey,
        endpointUrl: endpointEnabled ? endpointUrl(endpointKey) : null,
        ...(value.handlerKey !== undefined ? { handlerKey: value.handlerKey } : {}),
        validationErrors: validation.errors,
        localRevision: { increment: 1 },
        syncError: null,
      },
    });
  }

  async validateFlow(shopId, id) {
    const flow = await getFlowOrThrow(shopId, id);
    const validation = validateFlowJson(flow.flowJson);
    await prisma.waFlow.update({
      where: { id },
      data: { validationErrors: validation.errors },
    });
    return validation;
  }

  async deployFlow(shopId, id) {
    const flow = await getFlowOrThrow(shopId, id);
    if (flow.status !== "DRAFT") throw new Error("Only draft Flows can be deployed");
    const validation = validateFlowJson(flow.flowJson);
    if (!validation.valid) return validation;
    const integration = await getWaCredentials(shopId);
    if (!integration) throw new Error("WhatsApp integration not connected");
    if (!flow.flowId) throw new Error("Flow is not connected to Meta");

    await axios.post(
      `${BASE_URL}/${flow.flowId}`,
      {
        name: flow.name,
        categories: flow.categories,
        endpoint_uri: flow.endpointEnabled ? flow.endpointUrl : "",
        ...(flow.endpointEnabled && process.env.WHATSAPP_APP_ID ? { application_id: process.env.WHATSAPP_APP_ID } : {}),
      },
      { headers: { ...metaHeaders(integration.accessToken), "Content-Type": "application/json" } },
    );
    const form = new FormData();
    form.append("name", "flow.json");
    form.append("asset_type", "FLOW_JSON");
    form.append("file", new Blob([JSON.stringify(validation.flowJson)], { type: "application/json" }), "flow.json");
    const upload = await axios.post(`${BASE_URL}/${flow.flowId}/assets`, form, {
      headers: metaHeaders(integration.accessToken),
      maxBodyLength: Infinity,
    });
    const meta = await fetchMetaFlow(flow.flowId, integration.accessToken, integration.phoneNumberId);
    const validationErrors = upload.data.validation_errors || meta.validation_errors || [];
    return prisma.waFlow.update({
      where: { id },
      data: {
        ...metaProjection(meta),
        validationErrors,
        deployedRevision: validationErrors.length ? flow.deployedRevision : flow.localRevision,
      },
    });
  }

  async getPreview(shopId, id, invalidate = false) {
    const flow = await getFlowOrThrow(shopId, id);
    if (!flow.flowId) throw new Error("Flow is not connected to Meta");
    const integration = await getWaCredentials(shopId);
    const response = await axios.get(`${BASE_URL}/${flow.flowId}`, {
      params: { fields: `preview.invalidate(${invalidate ? "true" : "false"})` },
      headers: metaHeaders(integration.accessToken),
    });
    const preview = response.data.preview;
    await prisma.waFlow.update({
      where: { id },
      data: {
        previewUrl: preview?.preview_url,
        previewExpiresAt: preview?.expires_at ? new Date(preview.expires_at) : null,
      },
    });
    return preview;
  }

  async publishFlow(shopId, id) {
    const flow = await getFlowOrThrow(shopId, id);
    if (flow.status !== "DRAFT") throw new Error("Only draft Flows can be published");
    if (flow.deployedRevision !== flow.localRevision) throw new Error("Deploy the latest Flow JSON before publishing");
    if (Array.isArray(flow.validationErrors) && flow.validationErrors.length) throw new Error("Resolve Flow validation errors before publishing");
    const integration = await getWaCredentials(shopId);
    await axios.post(`${BASE_URL}/${flow.flowId}/publish`, null, { headers: metaHeaders(integration.accessToken) });
    const meta = await fetchMetaFlow(flow.flowId, integration.accessToken, integration.phoneNumberId);
    return prisma.waFlow.update({ where: { id }, data: metaProjection(meta) });
  }

  async deprecateFlow(shopId, id) {
    const flow = await getFlowOrThrow(shopId, id);
    if (!["PUBLISHED", "BLOCKED", "THROTTLED"].includes(flow.status)) throw new Error("Only active Flows can be deprecated");
    const integration = await getWaCredentials(shopId);
    await axios.post(`${BASE_URL}/${flow.flowId}/deprecate`, null, { headers: metaHeaders(integration.accessToken) });
    return prisma.waFlow.update({
      where: { id },
      data: { status: "DEPRECATED", deprecatedAt: new Date(), syncedAt: new Date() },
    });
  }

  async deleteFlow(shopId, id) {
    const flow = await getFlowOrThrow(shopId, id);
    if (flow.status !== "DRAFT") throw new Error("Only draft Flows can be deleted");
    const integration = await getWaCredentials(shopId);
    if (flow.flowId) await axios.delete(`${BASE_URL}/${flow.flowId}`, { headers: metaHeaders(integration.accessToken) });
    return prisma.waFlow.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async syncFlows(shopId) {
    const integration = await getWaCredentials(shopId);
    if (!integration) throw new Error("WhatsApp integration not connected");
    const remote = [];
    let url = `${BASE_URL}/${integration.businessAccountId}/flows?limit=100`;
    while (url) {
      const response = await axios.get(url, { headers: metaHeaders(integration.accessToken) });
      remote.push(...(response.data.data || []));
      url = response.data.paging?.next || null;
    }
    for (const item of remote) {
      const meta = await fetchMetaFlow(item.id, integration.accessToken, integration.phoneNumberId);
      await prisma.waFlow.upsert({
        where: { shopId_flowId: { shopId, flowId: item.id } },
        create: {
          shopId,
          flowId: item.id,
          endpointKey: crypto.randomUUID(),
          ...metaProjection(meta),
        },
        update: metaProjection(meta),
      });
    }
    return { count: remote.length };
  }

  async listExecutions(shopId, id, limit = 50) {
    await getFlowOrThrow(shopId, id);
    return prisma.waFlowExecution.findMany({
      where: { shopId, flowId: id },
      orderBy: { startedAt: "desc" },
      take: Math.min(Math.max(Number(limit) || 50, 1), 100),
      include: {
        conversation: { select: { contactName: true, phone: true } },
        customer: { select: { name: true } },
      },
    });
  }

  async sendFlow(shopId, id, input) {
    const flow = await getFlowOrThrow(shopId, id);
    const mode = input.mode || "published";
    if (mode === "published" && flow.status !== "PUBLISHED") throw new Error("Only published Flows can be sent to customers");
    if (mode === "draft" && flow.status !== "DRAFT") throw new Error("Draft mode is only available for draft Flows");
    if (!flow.flowId) throw new Error("Flow is not connected to Meta");
    const conversation = await prisma.waConversation.findFirst({
      where: { id: input.conversationId, shopId },
      select: { id: true, phone: true, customerId: true },
    });
    if (!conversation) throw new Error("Conversation not found");
    const flowToken = crypto.randomBytes(32).toString("base64url");
    const flowTokenHash = crypto.createHash("sha256").update(flowToken).digest("hex");
    const execution = await prisma.waFlowExecution.create({
      data: {
        shopId,
        flowId: flow.id,
        conversationId: conversation.id,
        customerId: conversation.customerId,
        flowToken,
        flowTokenHash,
        idempotencyKey: crypto.randomUUID(),
        inputJson: input.data || {},
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    try {
      const message = await whatsappService.sendMessage({
        shopId,
        conversationId: conversation.id,
        to: input.to || conversation.phone,
        message: {
          kind: "flow",
          executionId: execution.id,
          flowId: flow.flowId,
          flowToken,
          cta: input.cta,
          body: input.body,
          header: input.header,
          footer: input.footer,
          mode,
          action: input.action || (flow.endpointEnabled ? "data_exchange" : "navigate"),
          initialScreen: input.initialScreen,
          data: input.data,
        },
      });
      await prisma.waFlow.update({ where: { id: flow.id }, data: { totalSent: { increment: 1 } } });
      return { execution, message };
    } catch (error) {
      await prisma.waFlowExecution.update({
        where: { id: execution.id },
        data: { status: "FAILED", lastEndpointError: error.message },
      });
      throw error;
    }
  }

  async registerPublicKey(shopId) {
    const integration = await prisma.waIntegration.findUnique({
      where: { shopId },
      select: { phoneNumberId: true, rsaPublicKey: true },
    });
    if (!integration?.rsaPublicKey) throw new Error("Flow E2EE public key is not configured");
    const credentials = await getWaCredentials(shopId);
    const response = await axios.post(
      `${BASE_URL}/${integration.phoneNumberId}/whatsapp_business_encryption`,
      { business_public_key: integration.rsaPublicKey },
      { headers: { ...metaHeaders(credentials.accessToken), "Content-Type": "application/json" } },
    );
    return response.data;
  }
}

export const whatsappFlowService = new WhatsAppFlowService();
