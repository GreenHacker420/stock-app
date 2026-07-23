import { Directory, File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import type { WaLocalMedia } from "../../../api/whatsapp.api";

function safeFileName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "attachment";
}

export async function persistWhatsAppMedia(
  integrationId: string,
  media: WaLocalMedia,
): Promise<WaLocalMedia> {
  const root = new Directory(Paths.document, "whatsapp-pending");
  if (!root.exists) root.create({ idempotent: true, intermediates: true });
  const integrationDirectory = new Directory(root, integrationId);
  if (!integrationDirectory.exists) {
    integrationDirectory.create({ idempotent: true, intermediates: true });
  }

  const destination = new File(
    integrationDirectory,
    `${Crypto.randomUUID()}-${safeFileName(media.name)}`,
  );
  await new File(media.uri).copy(destination);
  return { ...media, uri: destination.uri };
}

export function removePersistedWhatsAppMedia(uri?: string) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Pending media is rebuildable, so cleanup is best effort.
  }
}
