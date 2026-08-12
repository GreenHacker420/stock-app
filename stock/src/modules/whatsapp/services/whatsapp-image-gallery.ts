import type { WaMessage } from "../../../api/whatsapp.api";
import { sqliteClient } from "../../../database/sqlite-client";
import { parseStoredMessage } from "../whatsapp-validation";
import { whatsappDb } from "./whatsapp-db";

type ScopeRow = {
  shop_id: string;
  integration_id: string;
  conversation_id: string;
  created_at: number;
};

type MessageRow = {
  payload_json: string;
};

const MAX_GALLERY_IMAGES = 500;

export async function getWhatsAppImageGalleryForMessage(
  messageId: string,
): Promise<WaMessage[]> {
  if (!messageId) return [];
  await whatsappDb.initialize();

  const scope = await sqliteClient.read((database) => database.first<ScopeRow>(
    `SELECT shop_id, integration_id, conversation_id, created_at
     FROM wa_messages
     WHERE id = ?
     LIMIT 1`,
    [messageId],
  ));
  if (!scope) return [];

  const rows = await sqliteClient.read((database) => database.all<MessageRow>(
    `SELECT payload_json
     FROM (
       SELECT id, created_at, payload_json
       FROM wa_messages
       WHERE shop_id = ?
         AND integration_id = ?
         AND conversation_id = ?
         AND message_type = 'IMAGE'
         AND COALESCE(content_state, 'VISIBLE') != 'DELETED'
       ORDER BY ABS(created_at - ?) ASC, created_at ASC, id ASC
       LIMIT ?
     )
     ORDER BY created_at ASC, id ASC`,
    [
      scope.shop_id,
      scope.integration_id,
      scope.conversation_id,
      scope.created_at,
      MAX_GALLERY_IMAGES,
    ],
  ));

  return rows
    .map((row) => parseStoredMessage(row.payload_json, scope.conversation_id))
    .filter((message): message is WaMessage =>
      Boolean(message?.asset?.url && message.type === "IMAGE"),
    );
}
