import axios from "axios";
import prisma from "../lib/db.js";
import { getWaCredentials } from "../lib/wa-cache.js";
import {
  attributeSchema,
  compileTemplateDefinition,
} from "./whatsapp.template-compiler.js";

const API_VERSION = "v25.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

function mappingStatus(mappings) {
  if (!mappings.length) return "VALID";
  return mappings.every((mapping) => mapping.attributeId || mapping.fallbackValue) ? "VALID" : "INCOMPLETE";
}

function normalizeStatus(status) {
  const allowed = ["APPROVED", "REJECTED", "PENDING", "PAUSED", "DISABLED", "IN_APPEAL", "DELETED"];
  return allowed.includes(status) ? status : "PENDING";
}

function getPath(source, path) {
  if (!source || !path) return undefined;
  return path.split(".").reduce((value, key) => value?.[key], source);
}

function formatAttributeValue(value, type) {
  if (value == null) return "";
  if (type === "CURRENCY") return Number(value).toLocaleString("en-IN", { style: "currency", currency: "INR" });
  if (type === "DATE") return new Date(value).toLocaleDateString("en-IN");
  if (type === "DATETIME") return new Date(value).toLocaleString("en-IN");
  if (type === "BOOLEAN") return value ? "Yes" : "No";
  return String(value);
}

async function resolveMetaAssetId(shopId, assetId, expectedKinds) {
  if (!assetId) throw new Error("A tenant media asset is required");
  const asset = await prisma.asset.findFirst({
    where: {
      id: assetId,
      shopId,
      status: "READY",
      kind: { in: expectedKinds },
    },
  });
  if (!asset?.externalId || asset.externalProvider !== "META_WHATSAPP") {
    throw new Error("Media asset is not available in WhatsApp");
  }
  return asset.externalId;
}

function componentByType(template, type) {
  return (template.draftDefinition?.carousel ? null : template.components)
    ?.find((component) => component.type?.toUpperCase() === type);
}

class WhatsAppTemplateService {
  async listAttributes(shopId) {
    return prisma.waTemplateAttribute.findMany({
      where: { shopId, isActive: true },
      orderBy: [{ isSystem: "desc" }, { label: "asc" }],
    });
  }

  async createAttribute(shopId, userId, input) {
    const value = attributeSchema.parse(input);
    return prisma.waTemplateAttribute.create({
      data: { ...value, shopId, createdById: userId },
    });
  }

  async updateAttribute(shopId, id, input) {
    const value = attributeSchema.partial().parse(input);
    const attribute = await prisma.waTemplateAttribute.findFirst({ where: { id, shopId } });
    if (!attribute) throw new Error("Template attribute not found");
    if (attribute.isSystem && (value.key || value.source || value.sourcePath)) {
      throw new Error("System attribute source cannot be changed");
    }
    return prisma.waTemplateAttribute.update({ where: { id }, data: value });
  }

  async deleteAttribute(shopId, id) {
    const attribute = await prisma.waTemplateAttribute.findFirst({ where: { id, shopId } });
    if (!attribute) throw new Error("Template attribute not found");
    if (attribute.isSystem) throw new Error("System attributes cannot be deleted");
    return prisma.waTemplateAttribute.update({ where: { id }, data: { isActive: false } });
  }

  async listTemplates(shopId, query = {}) {
    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 20, 1), 100);
    const where = {
      shopId,
      ...(query.status && query.status !== "ALL" ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
    };
    const [data, total] = await prisma.$transaction([
      prisma.waTemplate.findMany({
        where,
        include: {
          variableMappings: { include: { attribute: true }, orderBy: [{ component: "asc" }, { position: "asc" }] },
          versions: { orderBy: { version: "desc" }, take: 1 },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.waTemplate.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async getTemplate(shopId, id) {
    const template = await prisma.waTemplate.findFirst({
      where: { id, shopId },
      include: {
        variableMappings: { include: { attribute: true }, orderBy: [{ component: "asc" }, { position: "asc" }] },
        versions: { orderBy: { version: "desc" } },
      },
    });
    if (!template) throw new Error("Template not found");
    return template;
  }

  async createTemplate(shopId, userId, input) {
    const { definition, metaPayload } = compileTemplateDefinition(input);
    const integration = await getWaCredentials(shopId);
    if (!integration) throw new Error("WhatsApp integration not connected");

    const response = await axios.post(
      `${BASE_URL}/${integration.businessAccountId}/message_templates`,
      metaPayload,
      { headers: { Authorization: `Bearer ${integration.accessToken}`, "Content-Type": "application/json" } },
    );

    return prisma.$transaction(async (tx) => {
      const template = await tx.waTemplate.create({
        data: {
          shopId,
          metaTemplateId: response.data.id,
          name: definition.name,
          language: definition.language,
          category: definition.category,
          status: normalizeStatus(response.data.status),
          subtype: definition.subtype,
          parameterFormat: definition.parameterFormat,
          mappingStatus: mappingStatus(definition.mappings),
          components: metaPayload.components,
          draftDefinition: definition,
          rawMeta: response.data,
          syncedAt: new Date(),
        },
      });
      if (definition.mappings.length) {
        await tx.waTemplateVariableMapping.createMany({
          data: definition.mappings.map((mapping) => ({ ...mapping, templateId: template.id })),
        });
      }
      await tx.waTemplateVersion.create({
        data: {
          templateId: template.id,
          version: 1,
          definition,
          metaStatus: response.data.status,
          createdById: userId,
        },
      });
      return tx.waTemplate.findUnique({
        where: { id: template.id },
        include: { variableMappings: { include: { attribute: true } }, versions: true },
      });
    });
  }

  async updateTemplate(shopId, id, userId, input) {
    const current = await this.getTemplate(shopId, id);
    if (current.status === "DELETED") throw new Error("Deleted templates cannot be updated");
    const merged = { ...(current.draftDefinition || {}), ...input, name: current.name, language: current.language };
    const { definition, metaPayload } = compileTemplateDefinition(merged);
    const integration = await getWaCredentials(shopId);
    if (!integration) throw new Error("WhatsApp integration not connected");

    let metaResponse = {};
    if (current.metaTemplateId) {
      const response = await axios.post(
        `${BASE_URL}/${current.metaTemplateId}`,
        { category: metaPayload.category, components: metaPayload.components },
        { headers: { Authorization: `Bearer ${integration.accessToken}`, "Content-Type": "application/json" } },
      );
      metaResponse = response.data;
    }

    return prisma.$transaction(async (tx) => {
      const latest = await tx.waTemplateVersion.aggregate({
        where: { templateId: id },
        _max: { version: true },
      });
      await tx.waTemplateVariableMapping.deleteMany({ where: { templateId: id } });
      if (definition.mappings.length) {
        await tx.waTemplateVariableMapping.createMany({
          data: definition.mappings.map((mapping) => ({ ...mapping, templateId: id })),
        });
      }
      await tx.waTemplateVersion.create({
        data: {
          templateId: id,
          version: (latest._max.version || 0) + 1,
          definition,
          metaStatus: metaResponse.status || current.status,
          createdById: userId,
        },
      });
      await tx.waTemplate.update({
        where: { id },
        data: {
          category: definition.category,
          subtype: definition.subtype,
          parameterFormat: definition.parameterFormat,
          mappingStatus: mappingStatus(definition.mappings),
          components: metaPayload.components,
          draftDefinition: definition,
          rawMeta: metaResponse,
          status: metaResponse.status ? normalizeStatus(metaResponse.status) : "PENDING",
          statusUpdatedAt: new Date(),
          syncError: null,
        },
      });
      return tx.waTemplate.findUnique({
        where: { id },
        include: { variableMappings: { include: { attribute: true } }, versions: { orderBy: { version: "desc" } } },
      });
    });
  }

  async deleteTemplate(shopId, id) {
    const template = await this.getTemplate(shopId, id);
    const integration = await getWaCredentials(shopId);
    if (!integration) throw new Error("WhatsApp integration not connected");
    await axios.delete(`${BASE_URL}/${integration.businessAccountId}/message_templates`, {
      params: { name: template.name },
      headers: { Authorization: `Bearer ${integration.accessToken}` },
    });
    return prisma.waTemplate.update({
      where: { id },
      data: { status: "DELETED", deletedAt: new Date(), statusUpdatedAt: new Date() },
    });
  }

  async syncTemplates(shopId) {
    const integration = await getWaCredentials(shopId);
    if (!integration) throw new Error("WhatsApp integration not connected");
    const remote = [];
    let url = `${BASE_URL}/${integration.businessAccountId}/message_templates?limit=100`;
    while (url) {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${integration.accessToken}` },
      });
      remote.push(...(response.data.data || []));
      url = response.data.paging?.next || null;
    }

    const seenIds = [];
    for (const item of remote) {
      const existing = await prisma.waTemplate.findUnique({
        where: { shopId_name_language: { shopId, name: item.name, language: item.language } },
        include: { variableMappings: true },
      });
      const components = item.components || [];
      const headerVariables = components.find((component) => component.type === "HEADER")?.example?.header_text || [];
      const bodyVariables = components.find((component) => component.type === "BODY")?.example?.body_text?.[0] || [];
      const inferredMappings = [
        ...headerVariables.map((sampleValue, index) => ({ component: "HEADER", position: index + 1, sampleValue })),
        ...bodyVariables.map((sampleValue, index) => ({ component: "BODY", position: index + 1, sampleValue })),
      ];

      const template = await prisma.waTemplate.upsert({
        where: { shopId_name_language: { shopId, name: item.name, language: item.language } },
        create: {
          shopId,
          metaTemplateId: item.id,
          name: item.name,
          language: item.language,
          status: normalizeStatus(item.status),
          category: item.category,
          components,
          rawMeta: item,
          metaRejectionReason: item.rejected_reason,
          mappingStatus: inferredMappings.length ? "INCOMPLETE" : "VALID",
          syncedAt: new Date(),
          statusUpdatedAt: new Date(),
        },
        update: {
          metaTemplateId: item.id,
          status: normalizeStatus(item.status),
          category: item.category,
          components,
          rawMeta: item,
          metaRejectionReason: item.rejected_reason,
          mappingStatus: existing?.variableMappings?.length
            ? mappingStatus(existing.variableMappings)
            : inferredMappings.length ? "INCOMPLETE" : "VALID",
          syncedAt: new Date(),
          syncError: null,
          deletedAt: null,
          statusUpdatedAt: new Date(),
        },
      });
      seenIds.push(template.id);
      if (!existing && inferredMappings.length) {
        await prisma.waTemplateVariableMapping.createMany({
          data: inferredMappings.map((mapping) => ({ ...mapping, templateId: template.id })),
        });
      }
    }

    await prisma.waTemplate.updateMany({
      where: { shopId, id: { notIn: seenIds }, status: { not: "DELETED" } },
      data: { status: "DELETED", deletedAt: new Date(), statusUpdatedAt: new Date() },
    });
    return { count: remote.length };
  }

  async previewTemplate(shopId, id, context = {}) {
    const template = await this.getTemplate(shopId, id);
    const mappings = template.variableMappings;
    const resolved = {};
    for (const mapping of mappings) {
      let value;
      const attribute = mapping.attribute;
      if (attribute) {
        const source = {
          CUSTOMER: context.customer,
          CONVERSATION: context.conversation,
          SHOP: context.shop,
          CUSTOM: context.attributes,
          SYSTEM: context,
        }[attribute.source];
        value = getPath(source, attribute.sourcePath || attribute.key);
        value = formatAttributeValue(value, attribute.type);
      }
      resolved[`${mapping.component}:${mapping.position}:${mapping.buttonIndex ?? ""}:${mapping.cardIndex ?? ""}`] =
        value || mapping.fallbackValue || mapping.sampleValue;
    }
    return { template, values: resolved };
  }

  async compileTemplateMessage(shopId, id, input = {}) {
    const template = await this.getTemplate(shopId, id);
    if (template.status !== "APPROVED") throw new Error("Only approved templates can be sent");

    const conversation = input.conversationId
      ? await prisma.waConversation.findFirst({
          where: { id: input.conversationId, shopId },
          include: { customer: true, shop: true },
        })
      : null;
    const context = {
      customer: conversation?.customer,
      conversation,
      shop: conversation?.shop || await prisma.shop.findUnique({ where: { id: shopId } }),
      attributes: input.attributes || {},
    };

    const valuesByMappingId = input.values || {};
    const grouped = new Map();
    for (const mapping of template.variableMappings) {
      let value = valuesByMappingId[mapping.id];
      if (!value && mapping.attribute) {
        const source = {
          CUSTOMER: context.customer,
          CONVERSATION: context.conversation,
          SHOP: context.shop,
          CUSTOM: context.attributes,
          SYSTEM: context,
        }[mapping.attribute.source];
        value = formatAttributeValue(
          getPath(source, mapping.attribute.sourcePath || mapping.attribute.key),
          mapping.attribute.type,
        );
      }
      value = value || mapping.fallbackValue || mapping.attribute?.fallbackValue;
      if (!value && mapping.required) {
        throw new Error(`Value required for ${mapping.component.toLowerCase()} variable {{${mapping.position}}}`);
      }
      if (!value) continue;
      const key = JSON.stringify({
        component: mapping.component,
        buttonIndex: mapping.buttonIndex ?? null,
        cardIndex: mapping.cardIndex ?? null,
      });
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push({ position: mapping.position, value: String(value) });
    }

    const components = [];
    for (const [key, entries] of grouped.entries()) {
      const { component, buttonIndex, cardIndex } = JSON.parse(key);
      if (component === "CARD") continue;
      entries.sort((a, b) => a.position - b.position);
      if (component === "BUTTON") {
        components.push({
          type: "button",
          sub_type: "url",
          index: String(buttonIndex),
          parameters: entries.map((entry) => ({ type: "text", text: entry.value })),
        });
      } else if (component === "HEADER" || component === "BODY") {
        components.push({
          type: component.toLowerCase(),
          parameters: entries.map((entry) => ({ type: "text", text: entry.value })),
        });
      }
    }

    const definition = template.draftDefinition || {};
    const headerFormat = definition.header?.format
      || componentByType(template, "HEADER")?.format;
    if (headerFormat === "LOCATION") {
      if (!input.header?.location) throw new Error("Template location header is required");
      components.push({
        type: "header",
        parameters: [{ type: "location", location: input.header.location }],
      });
    } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormat)) {
      const metaAssetId = await resolveMetaAssetId(
        shopId,
        input.header?.assetId,
        headerFormat === "IMAGE" ? ["IMAGE"] : headerFormat === "VIDEO" ? ["VIDEO"] : ["DOCUMENT"],
      );
      const type = headerFormat.toLowerCase();
      components.push({
        type: "header",
        parameters: [{ type, [type]: { id: metaAssetId } }],
      });
    }

    const carouselDefinition = definition.carousel;
    const syncedCarousel = componentByType(template, "CAROUSEL");
    if (carouselDefinition || syncedCarousel) {
      const cardDefinitions = carouselDefinition?.cards || syncedCarousel.cards.map((card) => {
        const header = card.components.find((component) => component.type?.toUpperCase() === "HEADER");
        const body = card.components.find((component) => component.type?.toUpperCase() === "BODY");
        const buttons = card.components.find((component) => component.type?.toUpperCase() === "BUTTONS");
        return {
          header: { format: header?.format },
          body,
          buttons: buttons?.buttons || [],
        };
      });
      const carouselType = carouselDefinition?.type
        || (cardDefinitions[0]?.header.format === "PRODUCT" ? "PRODUCT" : "MEDIA");
      const cards = input.cards || [];
      const minimumCards = carouselType === "PRODUCT" ? 2 : cardDefinitions.length;
      const maximumCards = carouselType === "PRODUCT" ? 10 : cardDefinitions.length;
      if (cards.length < minimumCards || cards.length > maximumCards) {
        throw new Error(`Template requires ${minimumCards === maximumCards ? minimumCards : `${minimumCards}-${maximumCards}`} carousel cards`);
      }

      components.push({
        type: "carousel",
        cards: await Promise.all(cards.map(async (cardInput, cardIndex) => {
          const cardDefinition = cardDefinitions[Math.min(cardIndex, cardDefinitions.length - 1)];
          const cardComponents = [];
          const cardFormat = cardDefinition.header.format?.toUpperCase();
          if (cardFormat === "PRODUCT") {
            if (!cardInput.catalogId || !cardInput.productRetailerId) {
              throw new Error(`Catalog and product are required for carousel card ${cardIndex + 1}`);
            }
            cardComponents.push({
              type: "header",
              parameters: [{
                type: "product",
                product: {
                  catalog_id: cardInput.catalogId,
                  product_retailer_id: cardInput.productRetailerId,
                },
              }],
            });
          } else {
            const mediaType = cardFormat?.toLowerCase();
            const metaAssetId = await resolveMetaAssetId(
              shopId,
              cardInput.assetId,
              cardFormat === "VIDEO" ? ["VIDEO"] : ["IMAGE"],
            );
            cardComponents.push({
              type: "header",
              parameters: [{ type: mediaType, [mediaType]: { id: metaAssetId } }],
            });
          }

          const bodyEntries = grouped.get(JSON.stringify({
            component: "CARD",
            buttonIndex: null,
            cardIndex,
          }));
          if (bodyEntries?.length) {
            bodyEntries.sort((a, b) => a.position - b.position);
            cardComponents.push({
              type: "body",
              parameters: bodyEntries.map((entry) => ({ type: "text", text: entry.value })),
            });
          }

          (cardDefinition.buttons || []).forEach((button, buttonIndex) => {
            const buttonType = button.type?.toUpperCase();
            const urlEntries = grouped.get(JSON.stringify({
              component: "CARD",
              buttonIndex,
              cardIndex,
            }));
            if (buttonType === "URL" && urlEntries?.length) {
              urlEntries.sort((a, b) => a.position - b.position);
              cardComponents.push({
                type: "button",
                sub_type: "url",
                index: String(buttonIndex),
                parameters: urlEntries.map((entry) => ({ type: "text", text: entry.value })),
              });
            } else if (buttonType === "QUICK_REPLY" && cardInput.quickReplyPayloads?.[buttonIndex]) {
              cardComponents.push({
                type: "button",
                sub_type: "quick_reply",
                index: String(buttonIndex),
                parameters: [{ type: "payload", payload: cardInput.quickReplyPayloads[buttonIndex] }],
              });
            }
          });

          return { card_index: cardIndex, components: cardComponents };
        })),
      });
    }

    return {
      kind: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        ...(components.length ? { components } : {}),
      },
    };
  }
}

export const whatsappTemplateService = new WhatsAppTemplateService();
