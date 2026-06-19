import { z } from "zod";

const textSchema = z.object({
  kind: z.literal("text"),
  text: z.string().trim().min(1).max(4096),
  previewUrl: z.boolean().optional().default(false),
});

const mediaMetadata = {
  assetId: z.string().trim().min(1).optional(),
  link: z.string().url().optional(),
  mimeType: z.string().trim().min(1).optional(),
  caption: z.string().max(1024).optional(),
};

const imageSchema = z.object({
  kind: z.literal("image"),
  ...mediaMetadata,
});

const videoSchema = z.object({
  kind: z.literal("video"),
  ...mediaMetadata,
});

const audioSchema = z.object({
  kind: z.literal("audio"),
  assetId: z.string().trim().min(1).optional(),
  link: z.string().url().optional(),
  mimeType: z.string().trim().min(1).optional(),
  voice: z.boolean().optional().default(false),
});

const documentSchema = z.object({
  kind: z.literal("document"),
  ...mediaMetadata,
  filename: z.string().trim().min(1).max(240).optional(),
});

const stickerSchema = z.object({
  kind: z.literal("sticker"),
  assetId: z.string().trim().min(1).optional(),
  link: z.string().url().optional(),
  mimeType: z.string().trim().min(1).optional(),
});

const locationSchema = z.object({
  kind: z.literal("location"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().max(1000).optional(),
  address: z.string().max(1000).optional(),
});

const contactSchema = z.object({
  name: z.object({
    formatted_name: z.string().trim().min(1),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    middle_name: z.string().optional(),
    suffix: z.string().optional(),
    prefix: z.string().optional(),
  }),
  phones: z.array(z.object({
    phone: z.string().trim().min(1),
    type: z.string().optional(),
    wa_id: z.string().optional(),
  })).optional(),
  emails: z.array(z.object({
    email: z.string().email(),
    type: z.string().optional(),
  })).optional(),
  org: z.object({
    company: z.string().optional(),
    department: z.string().optional(),
    title: z.string().optional(),
  }).optional(),
  addresses: z.array(z.record(z.string(), z.any())).optional(),
  urls: z.array(z.object({
    url: z.string().url(),
    type: z.string().optional(),
  })).optional(),
  birthday: z.string().optional(),
});

const contactsSchema = z.object({
  kind: z.literal("contacts"),
  contacts: z.array(contactSchema).min(1).max(10),
});

const replyButtonsSchema = z.object({
  kind: z.literal("reply_buttons"),
  body: z.string().trim().min(1).max(1024),
  header: z.string().trim().min(1).max(60).optional(),
  footer: z.string().trim().min(1).max(60).optional(),
  buttons: z.array(z.object({
    id: z.string().trim().min(1).max(256),
    title: z.string().trim().min(1).max(20),
  })).min(1).max(3),
});

const listRowSchema = z.object({
  id: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(24),
  description: z.string().max(72).optional(),
});

const listSchema = z.object({
  kind: z.literal("list"),
  body: z.string().trim().min(1).max(1024),
  button: z.string().trim().min(1).max(20),
  header: z.string().trim().min(1).max(60).optional(),
  footer: z.string().trim().min(1).max(60).optional(),
  sections: z.array(z.object({
    title: z.string().trim().min(1).max(24).optional(),
    rows: z.array(listRowSchema).min(1).max(10),
  })).min(1).max(10),
}).superRefine((value, ctx) => {
  const rowCount = value.sections.reduce((count, section) => count + section.rows.length, 0);
  if (rowCount > 10) {
    ctx.addIssue({
      code: "custom",
      message: "List messages support at most 10 rows across all sections",
      path: ["sections"],
    });
  }
});

const templateSchema = z.object({
  kind: z.literal("template"),
  template: z.object({
    name: z.string().trim().min(1),
    language: z.object({ code: z.string().trim().min(1) }),
    components: z.array(z.any()).optional(),
  }).passthrough(),
});

const flowSchema = z.object({
  kind: z.literal("flow"),
  flowId: z.string().trim().min(1),
  flowToken: z.string().trim().min(1),
  cta: z.string().trim().min(1).max(30),
  body: z.string().trim().min(1).max(1024),
  header: z.string().trim().min(1).max(60).optional(),
  footer: z.string().trim().min(1).max(60).optional(),
  mode: z.enum(["draft", "published"]).default("published"),
  action: z.enum(["navigate", "data_exchange"]).default("navigate"),
  initialScreen: z.string().optional(),
  data: z.record(z.string(), z.any()).optional(),
});

export const outboundMessageSchema = z.discriminatedUnion("kind", [
  textSchema,
  imageSchema,
  videoSchema,
  audioSchema,
  documentSchema,
  stickerSchema,
  locationSchema,
  contactsSchema,
  replyButtonsSchema,
  listSchema,
  templateSchema,
  flowSchema,
]).superRefine((message, ctx) => {
  if (!["image", "video", "audio", "document", "sticker"].includes(message.kind)) return;
  const references = [message.assetId, message.link].filter(Boolean);
  if (references.length !== 1) {
    ctx.addIssue({
      code: "custom",
      message: "Media messages require exactly one of assetId or link",
      path: ["assetId"],
    });
  }
});

export const outboundCommandSchema = z.object({
  shopId: z.string().min(1),
  conversationId: z.string().min(1).optional(),
  to: z.string().trim().min(5),
  message: outboundMessageSchema,
  replyToMessageId: z.string().min(1).optional(),
  replyToMetaMessageId: z.string().min(1).optional(),
});

const TYPE_BY_KIND = {
  text: "TEXT",
  image: "IMAGE",
  video: "VIDEO",
  audio: "AUDIO",
  document: "DOCUMENT",
  sticker: "STICKER",
  location: "LOCATION",
  contacts: "CONTACT_CARD",
  reply_buttons: "INTERACTIVE",
  list: "INTERACTIVE",
  template: "TEMPLATE",
  flow: "FLOW",
};

function optionalText(type, text) {
  return text ? { type, text } : undefined;
}

function mediaReferencePayload(message) {
  return message.id ? { id: message.id } : { link: message.link };
}

export function compileMetaMessage({ to, message, replyToMetaMessageId }) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
  };

  if (replyToMetaMessageId) {
    payload.context = { message_id: replyToMetaMessageId };
  }

  if (message.kind === "text") {
    payload.type = "text";
    payload.text = { body: message.text, preview_url: message.previewUrl };
  } else if (["image", "video"].includes(message.kind)) {
    payload.type = message.kind;
    payload[message.kind] = {
      ...mediaReferencePayload(message),
      ...(message.caption ? { caption: message.caption } : {}),
    };
  } else if (message.kind === "audio") {
    payload.type = "audio";
    payload.audio = {
      ...mediaReferencePayload(message),
      ...(message.voice ? { voice: true } : {}),
    };
  } else if (message.kind === "document") {
    payload.type = "document";
    payload.document = {
      ...mediaReferencePayload(message),
      ...(message.caption ? { caption: message.caption } : {}),
      ...(message.filename ? { filename: message.filename } : {}),
    };
  } else if (message.kind === "sticker") {
    payload.type = "sticker";
    payload.sticker = mediaReferencePayload(message);
  } else if (message.kind === "location") {
    payload.type = "location";
    payload.location = {
      latitude: message.latitude,
      longitude: message.longitude,
      ...(message.name ? { name: message.name } : {}),
      ...(message.address ? { address: message.address } : {}),
    };
  } else if (message.kind === "contacts") {
    payload.type = "contacts";
    payload.contacts = message.contacts;
  } else if (message.kind === "reply_buttons") {
    payload.type = "interactive";
    payload.interactive = {
      type: "button",
      header: optionalText("text", message.header),
      body: { text: message.body },
      footer: optionalText("text", message.footer),
      action: {
        buttons: message.buttons.map((button) => ({
          type: "reply",
          reply: button,
        })),
      },
    };
  } else if (message.kind === "list") {
    payload.type = "interactive";
    payload.interactive = {
      type: "list",
      header: optionalText("text", message.header),
      body: { text: message.body },
      footer: optionalText("text", message.footer),
      action: {
        button: message.button,
        sections: message.sections,
      },
    };
  } else if (message.kind === "template") {
    payload.type = "template";
    payload.template = message.template;
  } else if (message.kind === "flow") {
    payload.type = "interactive";
    payload.interactive = {
      type: "flow",
      header: optionalText("text", message.header),
      body: { text: message.body },
      footer: optionalText("text", message.footer),
      action: {
        name: "flow",
        parameters: {
          mode: message.mode,
          flow_message_version: "3",
          flow_token: message.flowToken,
          flow_id: message.flowId,
          flow_cta: message.cta,
          flow_action: message.action,
          ...(message.initialScreen || message.data
            ? {
                flow_action_payload: {
                  ...(message.initialScreen ? { screen: message.initialScreen } : {}),
                  ...(message.data ? { data: message.data } : {}),
                },
              }
            : {}),
        },
      },
    };
  }

  if (payload.interactive) {
    if (!payload.interactive.header) delete payload.interactive.header;
    if (!payload.interactive.footer) delete payload.interactive.footer;
  }

  return payload;
}

export function getLocalMessageProjection(message) {
  const type = TYPE_BY_KIND[message.kind];
  const isMedia = ["image", "video", "audio", "document", "sticker"].includes(message.kind);

  if (message.kind === "text") {
    return { type, content: { text: message.text, previewUrl: message.previewUrl }, payload: { subtype: "text" } };
  }
  if (message.kind === "template") {
    return {
      type,
      content: { template: message.template },
      payload: { subtype: "template" },
      templateName: message.template.name,
      templateLanguage: message.template.language.code,
    };
  }

  if (isMedia) {
    return {
      type,
      content: {
        ...(message.caption ? { caption: message.caption } : {}),
        ...(message.kind === "document" && message.filename ? { filename: message.filename } : {}),
      },
      payload: { subtype: message.kind, ...(message.voice ? { voice: true } : {}) },
      assetId: message.assetId,
    };
  }

  return {
    type,
    content: message,
    payload: { subtype: message.kind, ...(message.voice ? { voice: true } : {}) },
  };
}

export function requiresServiceWindow(message) {
  return message.kind !== "template";
}
