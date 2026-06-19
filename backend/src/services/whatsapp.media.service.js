import axios from "axios";
import crypto from "crypto";
import { getWaCredentials } from "../lib/wa-cache.js";
import { getSignedMediaUrl, uploadToS3 } from "../lib/wa-media.js";
import { validateWhatsAppMedia } from "./whatsapp.media-policy.js";

const API_VERSION = "v25.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

export async function uploadWhatsAppMedia({ shopId, kind, file }) {
  const parsedKind = validateWhatsAppMedia({ kind, file });
  const integration = await getWaCredentials(shopId);
  if (!integration) {
    throw new Error("WhatsApp integration not connected for this shop");
  }

  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageKey = `shops/${shopId}/outbound/${crypto.randomUUID()}-${safeName}`;
  const stored = await uploadToS3(file.buffer, storageKey, file.mimetype);

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", file.mimetype);
  form.append(
    "file",
    new Blob([file.buffer], { type: file.mimetype }),
    file.originalname,
  );

  const response = await axios.post(
    `${BASE_URL}/${integration.phoneNumberId}/media`,
    form,
    {
      headers: {
        Authorization: `Bearer ${integration.accessToken}`,
      },
      maxBodyLength: Infinity,
    },
  );

  return {
    id: response.data.id,
    kind: parsedKind,
    mimeType: file.mimetype,
    fileName: file.originalname,
    size: file.size,
    storageKey: stored.key,
    storageBucket: stored.bucket,
    previewUrl: await getSignedMediaUrl(stored.key),
  };
}
