import type { WaMessage } from "../../../api/whatsapp.api";
import { sqliteClient } from "../../../database/sqlite-client";
import { parseStoredMessage } from "../whatsapp-validation";
import { whatsappDb } from "./whatsapp-db";

type MessageRow = { payload_json: string };
type CountRow = { count: number };

export type WhatsAppProfileLink = {
  message: WaMessage;
  url: string;
};

export type WhatsAppProfileContent = {
  media: WaMessage[];
  documents: WaMessage[];
  links: WhatsAppProfileLink[];
  counts: {
    media: number;
    documents: number;
    links: number;
  };
};

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

function firstHttpUrl(message: WaMessage) {
  const text = [message.content?.text, message.content?.caption]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
  const match = text.match(URL_PATTERN)?.[0];
  return match?.replace(/[),.;!?]+$/, "");
}

function parseRows(rows: MessageRow[], conversationId: string) {
  return rows
    .map((row) => parseStoredMessage(row.payload_json, conversationId))
    .filter((message): message is WaMessage => Boolean(message));
}

export async function getWhatsAppProfileContent(
  shopId: string,
  integrationId: string,
  conversationId: string,
): Promise<WhatsAppProfileContent> {
  await whatsappDb.initialize();

  const [counts, mediaRows, documentRows, linkRows] = await Promise.all([
    sqliteClient.read((database) => database.first<{
      media_count: number;
      document_count: number;
    }>(
      `SELECT
         SUM(CASE WHEN message_type IN ('IMAGE', 'VIDEO') AND COALESCE(content_state, 'VISIBLE') != 'DELETED' THEN 1 ELSE 0 END) AS media_count,
         SUM(CASE WHEN message_type = 'DOCUMENT' AND COALESCE(content_state, 'VISIBLE') != 'DELETED' THEN 1 ELSE 0 END) AS document_count
       FROM wa_messages
       WHERE shop_id = ? AND integration_id = ? AND conversation_id = ?`,
      [shopId, integrationId, conversationId],
    )),
    sqliteClient.read((database) => database.all<MessageRow>(
      `SELECT payload_json
       FROM wa_messages
       WHERE shop_id = ?
         AND integration_id = ?
         AND conversation_id = ?
         AND message_type IN ('IMAGE', 'VIDEO')
         AND COALESCE(content_state, 'VISIBLE') != 'DELETED'
       ORDER BY created_at DESC, id DESC
       LIMIT 24`,
      [shopId, integrationId, conversationId],
    )),
    sqliteClient.read((database) => database.all<MessageRow>(
      `SELECT payload_json
       FROM wa_messages
       WHERE shop_id = ?
         AND integration_id = ?
         AND conversation_id = ?
         AND message_type = 'DOCUMENT'
         AND COALESCE(content_state, 'VISIBLE') != 'DELETED'
       ORDER BY created_at DESC, id DESC
       LIMIT 16`,
      [shopId, integrationId, conversationId],
    )),
    sqliteClient.read((database) => database.all<MessageRow>(
      `SELECT payload_json
       FROM wa_messages
       WHERE shop_id = ?
         AND integration_id = ?
         AND conversation_id = ?
         AND COALESCE(content_state, 'VISIBLE') != 'DELETED'
         AND payload_json LIKE '%http%'
       ORDER BY created_at DESC, id DESC`,
      [shopId, integrationId, conversationId],
    )),
  ]);

  const media = parseRows(mediaRows, conversationId);
  const documents = parseRows(documentRows, conversationId);
  const linkMessages = parseRows(linkRows, conversationId);
  const allLinks = linkMessages.flatMap((message) => {
    const url = firstHttpUrl(message);
    return url ? [{ message, url }] : [];
  });

  return {
    media,
    documents,
    links: allLinks.slice(0, 16),
    counts: {
      media: Number(counts?.media_count || 0),
      documents: Number(counts?.document_count || 0),
      links: allLinks.length,
    },
  };
}
