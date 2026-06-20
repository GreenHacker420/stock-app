import { z } from "zod";

const variableMappingSchema = z.object({
  component: z.enum(["HEADER", "BODY", "BUTTON", "CARD"]),
  position: z.number().int().min(1),
  buttonIndex: z.number().int().min(0).optional(),
  cardIndex: z.number().int().min(0).optional(),
  attributeId: z.string().min(1).optional().nullable(),
  sampleValue: z.string().min(1).max(500),
  fallbackValue: z.string().max(500).optional().nullable(),
  required: z.boolean().optional().default(true),
});

const buttonSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("QUICK_REPLY"), text: z.string().trim().min(1).max(25) }),
  z.object({
    type: z.literal("URL"),
    text: z.string().trim().min(1).max(25),
    url: z.string().url().max(2000),
    example: z.string().max(2000).optional(),
  }),
  z.object({
    type: z.literal("PHONE_NUMBER"),
    text: z.string().trim().min(1).max(25),
    phoneNumber: z.string().trim().min(5).max(32),
  }),
  z.object({
    type: z.literal("COPY_CODE"),
    text: z.string().trim().min(1).max(25).optional(),
    example: z.string().max(20).optional(),
  }),
  z.object({
    type: z.literal("FLOW"),
    text: z.string().trim().min(1).max(25),
    flowId: z.string().trim().min(1),
    flowAction: z.enum(["NAVIGATE", "DATA_EXCHANGE"]).optional(),
  }),
]);

const carouselButtonSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("QUICK_REPLY"), text: z.string().trim().min(1).max(25) }),
  z.object({
    type: z.literal("URL"),
    text: z.string().trim().min(1).max(25),
    url: z.string().url().max(2000),
    example: z.string().max(2000).optional(),
  }),
  z.object({
    type: z.literal("PHONE_NUMBER"),
    text: z.string().trim().min(1).max(25),
    phoneNumber: z.string().trim().min(5).max(20),
  }),
  z.object({ type: z.literal("SPM"), text: z.string().trim().min(1).max(25).default("View") }),
]);

const carouselCardSchema = z.object({
  header: z.object({
    format: z.enum(["IMAGE", "VIDEO", "PRODUCT"]),
    exampleHandle: z.string().optional(),
  }),
  body: z.object({ text: z.string().max(160) }).optional(),
  buttons: z.array(carouselButtonSchema).max(2).default([]),
});

export const templateDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(512).regex(/^[a-z0-9_]+$/),
  language: z.string().trim().min(2).max(20).default("en_US"),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  subtype: z.string().max(80).optional(),
  parameterFormat: z.enum(["POSITIONAL", "NAMED"]).default("POSITIONAL"),
  allowCategoryChange: z.boolean().optional().default(false),
  header: z.object({
    format: z.enum(["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT", "LOCATION"]).default("NONE"),
    text: z.string().max(60).optional(),
    exampleHandle: z.string().optional(),
    documentFileName: z.string().max(240).optional(),
  }).optional(),
  body: z.object({
    text: z.string().min(1).max(1024),
    addSecurityRecommendation: z.boolean().optional(),
  }),
  footer: z.object({
    text: z.string().max(60).optional(),
    codeExpirationMinutes: z.number().int().min(1).max(90).optional(),
  }).optional(),
  buttons: z.array(buttonSchema).max(10).optional().default([]),
  authentication: z.object({
    otpType: z.enum(["COPY_CODE", "ONE_TAP", "ZERO_TAP"]),
    packageName: z.string().optional(),
    signatureHash: z.string().optional(),
    zeroTapTermsAccepted: z.boolean().optional(),
  }).optional(),
  callPermissionRequest: z.boolean().optional().default(false),
  carousel: z.object({
    type: z.enum(["MEDIA", "PRODUCT"]),
    cards: z.array(carouselCardSchema).min(2).max(10),
  }).optional(),
  mappings: z.array(variableMappingSchema).optional().default([]),
}).superRefine((definition, ctx) => {
  const validateUrlButton = (button, path) => {
    if (button.type !== "URL") return;
    const variables = extractVariables(button.url);
    if (variables.length > 1 || (variables.length === 1 && !button.url.endsWith(`{{${variables[0]}}}`))) {
      ctx.addIssue({
        code: "custom",
        message: "URL buttons support one variable appended to the end of the URL",
        path,
      });
    }
  };
  definition.buttons.forEach((button, index) => validateUrlButton(button, ["buttons", index, "url"]));
  if (
    definition.header
    && ["IMAGE", "VIDEO", "DOCUMENT"].includes(definition.header.format)
    && !definition.header.exampleHandle
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Media template headers require an uploaded example handle",
      path: ["header", "exampleHandle"],
    });
  }
  if (definition.callPermissionRequest && (
    definition.category === "AUTHENTICATION"
    || definition.buttons.length
    || definition.carousel
  )) {
    ctx.addIssue({
      code: "custom",
      message: "Call permission request templates cannot include other interactive components",
      path: ["callPermissionRequest"],
    });
  }

  if (!definition.carousel) return;
  if (definition.category !== "MARKETING") {
    ctx.addIssue({ code: "custom", message: "Carousel templates must use the marketing category", path: ["category"] });
  }
  const { type, cards } = definition.carousel;
  if (type === "PRODUCT" && cards.length !== 2) {
    ctx.addIssue({ code: "custom", message: "Product carousel templates must define exactly two cards", path: ["carousel", "cards"] });
  }
  const expectedHeader = type === "PRODUCT" ? "PRODUCT" : cards[0]?.header.format;
  const expectedBody = Boolean(cards[0]?.body);
  const expectedButtons = cards[0]?.buttons.map((button) => button.type).join("|");
  cards.forEach((card, index) => {
    card.buttons.forEach((button, buttonIndex) => {
      validateUrlButton(button, ["carousel", "cards", index, "buttons", buttonIndex, "url"]);
    });
    if (card.header.format !== expectedHeader) {
      ctx.addIssue({ code: "custom", message: "All carousel cards must use the same header format", path: ["carousel", "cards", index, "header"] });
    }
    if (Boolean(card.body) !== expectedBody) {
      ctx.addIssue({ code: "custom", message: "All carousel cards must consistently include or omit body text", path: ["carousel", "cards", index, "body"] });
    }
    if (card.buttons.map((button) => button.type).join("|") !== expectedButtons) {
      ctx.addIssue({ code: "custom", message: "All carousel cards must use the same button types and order", path: ["carousel", "cards", index, "buttons"] });
    }
    if (type === "MEDIA" && !["IMAGE", "VIDEO"].includes(card.header.format)) {
      ctx.addIssue({ code: "custom", message: "Media carousel cards require image or video headers", path: ["carousel", "cards", index, "header"] });
    }
    if (type === "MEDIA" && !card.header.exampleHandle) {
      ctx.addIssue({ code: "custom", message: "Media carousel cards require an uploaded example handle", path: ["carousel", "cards", index, "header", "exampleHandle"] });
    }
    if (type === "PRODUCT" && card.buttons.some((button) => !["SPM", "URL"].includes(button.type))) {
      ctx.addIssue({ code: "custom", message: "Product carousel cards support only View or URL buttons", path: ["carousel", "cards", index, "buttons"] });
    }
    if (type === "PRODUCT" && card.buttons.length !== 1) {
      ctx.addIssue({ code: "custom", message: "Product carousel cards require exactly one View or URL button", path: ["carousel", "cards", index, "buttons"] });
    }
  });
});

export const attributeSchema = z.object({
  key: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9_.]+$/),
  label: z.string().trim().min(1).max(120),
  type: z.enum(["TEXT", "NUMBER", "CURRENCY", "DATE", "DATETIME", "BOOLEAN", "URL", "PHONE", "EMAIL"]).default("TEXT"),
  source: z.enum(["CUSTOMER", "CONVERSATION", "SHOP", "CUSTOM"]).default("CUSTOM"),
  sourcePath: z.string().trim().max(200).optional().nullable(),
  fallbackValue: z.string().max(500).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});

function extractVariables(text = "") {
  return [...new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1])))]
    .sort((a, b) => a - b);
}

function validateMappings(definition) {
  const expected = [
    ...extractVariables(definition.header?.text).map((position) => ({ component: "HEADER", position })),
    ...extractVariables(definition.body.text).map((position) => ({ component: "BODY", position })),
    ...definition.buttons.flatMap((button, buttonIndex) => (
      button.type === "URL"
        ? extractVariables(button.url).map((position) => ({ component: "BUTTON", position, buttonIndex }))
        : []
    )),
    ...(definition.carousel?.cards || []).flatMap((card, cardIndex) => [
      ...extractVariables(card.body?.text).map((position) => ({
        component: "CARD",
        position,
        cardIndex,
      })),
      ...card.buttons.flatMap((button, buttonIndex) => (
        button.type === "URL"
          ? extractVariables(button.url).map((position) => ({
            component: "CARD",
            position,
            buttonIndex,
            cardIndex,
          }))
          : []
      )),
    ]),
  ];
  for (const item of expected) {
    const mapping = definition.mappings.find(
      (candidate) => candidate.component === item.component
        && candidate.position === item.position
        && candidate.buttonIndex === item.buttonIndex
        && candidate.cardIndex === item.cardIndex,
    );
    if (!mapping) throw new Error(`Missing ${item.component.toLowerCase()} mapping for {{${item.position}}}`);
  }
}

function compileTemplateButton(button, mappings = []) {
  if (button.type === "URL") {
    const mappingExamples = mappings
      .sort((a, b) => a.position - b.position)
      .map((mapping) => mapping.sampleValue);
    return {
      type: "URL",
      text: button.text,
      url: button.url,
      ...(button.example || mappingExamples.length
        ? { example: [button.example || mappingExamples.join("")] }
        : {}),
    };
  }
  if (button.type === "PHONE_NUMBER") {
    return { type: "PHONE_NUMBER", text: button.text, phone_number: button.phoneNumber };
  }
  if (button.type === "SPM") return { type: "SPM", text: button.text || "View" };
  if (button.type === "COPY_CODE") {
    return { type: "COPY_CODE", text: button.text || "Copy code", ...(button.example ? { example: button.example } : {}) };
  }
  if (button.type === "FLOW") {
    return {
      type: "FLOW",
      text: button.text,
      flow_id: button.flowId,
      flow_action: button.flowAction || "NAVIGATE",
    };
  }
  return { type: "QUICK_REPLY", text: button.text };
}

function compileButtons(definition) {
  if (definition.category === "AUTHENTICATION") {
    const authentication = definition.authentication;
    if (!authentication) throw new Error("Authentication settings are required");
    const button = { type: "OTP", otp_type: authentication.otpType };
    if (["ONE_TAP", "ZERO_TAP"].includes(authentication.otpType)) {
      if (!authentication.packageName || !authentication.signatureHash) {
        throw new Error("Android package name and signature hash are required");
      }
      button.supported_apps = [{
        package_name: authentication.packageName,
        signature_hash: authentication.signatureHash,
      }];
    }
    if (authentication.otpType === "ZERO_TAP") {
      button.zero_tap_terms_accepted = authentication.zeroTapTermsAccepted === true;
    }
    return [button];
  }

  return definition.buttons.map((button, buttonIndex) => compileTemplateButton(
    button,
    definition.mappings.filter((mapping) => mapping.component === "BUTTON" && mapping.buttonIndex === buttonIndex),
  ));
}

function compileCarousel(definition) {
  if (!definition.carousel) return null;
  return {
    type: "CAROUSEL",
    cards: definition.carousel.cards.map((card, cardIndex) => {
      const components = [{
        type: "HEADER",
        format: card.header.format,
        ...(card.header.exampleHandle
          ? { example: { header_handle: [card.header.exampleHandle] } }
          : {}),
      }];
      if (card.body) {
        const bodyExamples = definition.mappings
          .filter((mapping) => mapping.component === "CARD" && mapping.cardIndex === cardIndex && mapping.buttonIndex == null)
          .sort((a, b) => a.position - b.position)
          .map((mapping) => mapping.sampleValue);
        components.push({
          type: "BODY",
          text: card.body.text,
          ...(bodyExamples.length ? { example: { body_text: bodyExamples } } : {}),
        });
      }
      if (card.buttons.length) {
        components.push({
          type: "BUTTONS",
          buttons: card.buttons.map((button, buttonIndex) => compileTemplateButton(
            button,
            definition.mappings.filter((mapping) => (
              mapping.component === "CARD"
              && mapping.cardIndex === cardIndex
              && mapping.buttonIndex === buttonIndex
            )),
          )),
        });
      }
      return { components };
    }),
  };
}

export function compileTemplateDefinition(input) {
  const definition = templateDefinitionSchema.parse(input);
  validateMappings(definition);
  const components = [];

  if (definition.category === "AUTHENTICATION") {
    components.push({
      type: "BODY",
      ...(definition.body.addSecurityRecommendation ? { add_security_recommendation: true } : {}),
    });
    if (definition.footer?.codeExpirationMinutes) {
      components.push({ type: "FOOTER", code_expiration_minutes: definition.footer.codeExpirationMinutes });
    }
  } else {
    const header = definition.header;
    if (header && header.format !== "NONE") {
      if (header.format === "TEXT") {
        const values = definition.mappings
          .filter((mapping) => mapping.component === "HEADER")
          .sort((a, b) => a.position - b.position)
          .map((mapping) => mapping.sampleValue);
        components.push({
          type: "HEADER",
          format: "TEXT",
          text: header.text,
          ...(values.length ? { example: { header_text: values } } : {}),
        });
      } else {
        components.push({
          type: "HEADER",
          format: header.format,
          ...(header.exampleHandle ? { example: { header_handle: [header.exampleHandle] } } : {}),
        });
      }
    }
    const bodyValues = definition.mappings
      .filter((mapping) => mapping.component === "BODY")
      .sort((a, b) => a.position - b.position)
      .map((mapping) => mapping.sampleValue);
    components.push({
      type: "BODY",
      text: definition.body.text,
      ...(bodyValues.length ? { example: { body_text: [bodyValues] } } : {}),
    });
    if (definition.footer?.text) components.push({ type: "FOOTER", text: definition.footer.text });
  }

  const buttons = compileButtons(definition);
  if (buttons.length) components.push({ type: "BUTTONS", buttons });
  const carousel = compileCarousel(definition);
  if (carousel) components.push(carousel);
  if (definition.callPermissionRequest) components.push({ type: "CALL_PERMISSION_REQUEST" });

  return {
    definition,
    metaPayload: {
      name: definition.name,
      language: definition.language,
      category: definition.category,
      components,
      ...(definition.allowCategoryChange ? { allow_category_change: true } : {}),
      ...(definition.parameterFormat === "NAMED" ? { parameter_format: "NAMED" } : {}),
    },
  };
}
