import { z } from "zod";

const mediaKindSchema = z.enum(["image", "video", "audio", "document", "sticker"]);

const MEDIA_RULES = {
  image: {
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: new Set(["image/jpeg", "image/png"]),
  },
  video: {
    maxBytes: 16 * 1024 * 1024,
    mimeTypes: new Set(["video/mp4", "video/3gpp"]),
  },
  audio: {
    maxBytes: 16 * 1024 * 1024,
    mimeTypes: new Set([
      "audio/aac",
      "audio/amr",
      "audio/mpeg",
      "audio/mp4",
      "audio/ogg",
    ]),
  },
  document: {
    maxBytes: 100 * 1024 * 1024,
    mimeTypes: new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.ms-excel",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
    ]),
  },
  sticker: {
    maxBytes: 1024 * 1024,
    mimeTypes: new Set(["image/webp"]),
  },
};

export function getWhatsAppMediaPolicy() {
  return Object.fromEntries(
    Object.entries(MEDIA_RULES).map(([kind, rule]) => [
      kind,
      {
        maxBytes: rule.maxBytes,
        mimeTypes: [...rule.mimeTypes],
      },
    ]),
  );
}

export function validateWhatsAppMedia({ kind, file }) {
  const parsedKind = mediaKindSchema.parse(kind);
  if (!file?.buffer || !file.mimetype || !file.originalname) {
    throw new Error("A media file is required");
  }

  const rule = MEDIA_RULES[parsedKind];
  if (!rule.mimeTypes.has(file.mimetype)) {
    throw new Error(`${file.mimetype} is not supported for WhatsApp ${parsedKind} messages`);
  }
  if (file.size > rule.maxBytes) {
    throw new Error(`WhatsApp ${parsedKind} files must be ${Math.floor(rule.maxBytes / 1024 / 1024)} MB or smaller`);
  }

  return parsedKind;
}
