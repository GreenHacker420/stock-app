import type {
  WaConversation,
  WaMessage,
  WaOperationState,
  WaOutboundMessage,
  WhatsAppCapability,
} from "../../../api/whatsapp.api";
import { sqliteClient } from "../../../database/sqlite-client";
import { mmkvStorage } from "../../../auth/mmkv-storage";
import {
  isWaConversation,
  isWaMessage,
  parseStoredConversation,
  parseStoredMessage,
  whatsappConversationCacheKey,
  whatsappMessageCacheKey,
} from "../whatsapp-validation";

const LOCAL_PAGE_LIMIT = 1_000;

export type PendingWhatsAppOperation = {
  id: string;
  shopId: string;
  integrationId: string;
  conversationId: string;
  clientMessageId: string;
  operationType: "SEND_MESSAGE" | "UPLOAD_MEDIA";
  operationState: WaOperationState;
  payload: {
    message?: WaOutboundMessage;
    replyToMessageId?: string;
    media?: {
      kind: "image" | "video" | "audio" | "document";
      uri: string;
      name: string;
      mimeType: string;
      size?: number;
      width?: number;
      height?: number;
      durationMs?: number;
    };
    mediaMessage?: {
      kind: "image" | "video" | "audio" | "document";
      caption?: string;
      filename?: string;
      voice?: boolean;
    };
  };
  attempt: number;
  nextAttemptAt: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
};

type ConversationRow = {
  payload_json: string;
};

type MessageRow = {
  payload_json: string;
};

type PendingOperationRow = {
  id: string;
  shop_id: string;
  integration_id: string;
  conversation_id: string;
  client_message_id: string;
  operation_type: PendingWhatsAppOperation["operationType"];
  operation_state: WaOperationState;
  payload_json: string;
  attempt: number;
  next_attempt_at: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
};

let schemaPromise: Promise<void> | null = null;

function initializeDatabase() {
  if (!schemaPromise) {
    schemaPromise = sqliteClient.write(async (database) => {
      await database.exec(`
    CREATE TABLE IF NOT EXISTS wa_conversations (
      id TEXT NOT NULL,
      shop_id TEXT NOT NULL,
      integration_id TEXT NOT NULL,
      phone_number_id TEXT,
      customer_id TEXT,
      phone TEXT NOT NULL,
      contact_name TEXT,
      unread_count INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      assigned_to_id TEXT,
      entity_version INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (shop_id, integration_id, id)
    );

    CREATE TABLE IF NOT EXISTS wa_messages (
      id TEXT PRIMARY KEY NOT NULL,
      shop_id TEXT NOT NULL,
      integration_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      client_message_id TEXT,
      provider_message_id TEXT,
      direction TEXT NOT NULL,
      message_type TEXT NOT NULL,
      operation_state TEXT,
      provider_status TEXT,
      content_state TEXT,
      entity_version INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wa_message_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      provider_status TEXT NOT NULL,
      provider_status_at INTEGER NOT NULL,
      entity_version INTEGER NOT NULL,
      UNIQUE(message_id, attempt, provider_status, provider_status_at)
    );

    CREATE TABLE IF NOT EXISTS wa_drafts (
      shop_id TEXT NOT NULL,
      integration_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      reply_to_message_id TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (shop_id, integration_id, conversation_id)
    );

    CREATE TABLE IF NOT EXISTS wa_pending_operations (
      id TEXT PRIMARY KEY NOT NULL,
      shop_id TEXT NOT NULL,
      integration_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      client_message_id TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      operation_state TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wa_media_cache (
      id TEXT PRIMARY KEY NOT NULL,
      shop_id TEXT NOT NULL,
      integration_id TEXT NOT NULL,
      message_id TEXT,
      local_uri TEXT,
      remote_url TEXT,
      thumbnail_uri TEXT,
      mime_type TEXT,
      size_bytes INTEGER,
      width INTEGER,
      height INTEGER,
      duration_ms INTEGER,
      last_accessed_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wa_sync_state (
      shop_id TEXT NOT NULL,
      integration_id TEXT NOT NULL,
      stream_cursor TEXT,
      conversation_snapshot_cursor TEXT,
      last_reconciled_at INTEGER,
      PRIMARY KEY (shop_id, integration_id)
    );

    CREATE TABLE IF NOT EXISTS wa_contact_index (
      id TEXT PRIMARY KEY NOT NULL,
      shop_id TEXT NOT NULL,
      integration_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      display_name TEXT,
      customer_id TEXT,
      normalized_search TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS wa_conversations_scope_updated_idx
      ON wa_conversations(shop_id, integration_id, updated_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS wa_messages_conversation_created_idx
      ON wa_messages(conversation_id, created_at DESC, id DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS wa_messages_integration_client_idx
      ON wa_messages(integration_id, client_message_id)
      WHERE client_message_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS wa_messages_provider_idx
      ON wa_messages(provider_message_id)
      WHERE provider_message_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS wa_pending_operations_ready_idx
      ON wa_pending_operations(operation_state, next_attempt_at);
    CREATE INDEX IF NOT EXISTS wa_contact_index_search_idx
      ON wa_contact_index(shop_id, integration_id, normalized_search);
  `);
      const columns = await database.all<{ name: string; pk: number }>(
        "PRAGMA table_info(wa_conversations)",
      );
      const primaryKey = columns
        .filter((column) => column.pk > 0)
        .sort((left, right) => left.pk - right.pk)
        .map((column) => column.name);
      if (primaryKey.join(",") === "id") {
        await database.exec(`
          DROP INDEX IF EXISTS wa_conversations_scope_updated_idx;
          ALTER TABLE wa_conversations RENAME TO wa_conversations_legacy;
          CREATE TABLE wa_conversations (
            id TEXT NOT NULL,
            shop_id TEXT NOT NULL,
            integration_id TEXT NOT NULL,
            phone_number_id TEXT,
            customer_id TEXT,
            phone TEXT NOT NULL,
            contact_name TEXT,
            unread_count INTEGER NOT NULL DEFAULT 0,
            is_archived INTEGER NOT NULL DEFAULT 0,
            is_pinned INTEGER NOT NULL DEFAULT 0,
            assigned_to_id TEXT,
            entity_version INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            payload_json TEXT NOT NULL,
            PRIMARY KEY (shop_id, integration_id, id)
          );
          INSERT INTO wa_conversations
          SELECT * FROM wa_conversations_legacy;
          DROP TABLE wa_conversations_legacy;
          CREATE INDEX wa_conversations_scope_updated_idx
            ON wa_conversations(shop_id, integration_id, updated_at DESC, id DESC);
        `);
      }
    });
  }
  return schemaPromise;
}

function timestamp(value?: string | null) {
  const parsed = value ? new Date(value).getTime() : Date.now();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function refreshFastConversationSnapshot(shopId: string, integrationId: string) {
  const rows = await sqliteClient.read((database) => database.all<ConversationRow>(
    `SELECT payload_json
     FROM wa_conversations
     WHERE shop_id = ? AND integration_id = ?
     ORDER BY is_pinned DESC, updated_at DESC, id DESC
     LIMIT ?`,
    [shopId, integrationId, LOCAL_PAGE_LIMIT],
  ));
  const conversations = rows
    .map((row) => parseStoredConversation(row.payload_json))
    .filter((row): row is WaConversation => Boolean(row));
  try {
    mmkvStorage.setItem(
      whatsappConversationCacheKey(shopId, integrationId),
      JSON.stringify(conversations),
    );
  } catch {
    // SQLite remains authoritative if the fast-start cache cannot be written.
  }
  return conversations;
}

async function refreshFastMessageSnapshot(
  shopId: string,
  integrationId: string,
  conversationId: string,
) {
  const rows = await sqliteClient.read((database) => database.all<MessageRow>(
    `SELECT payload_json
     FROM (
       SELECT id, created_at, payload_json
       FROM wa_messages
       WHERE shop_id = ? AND integration_id = ? AND conversation_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 75
     )
     ORDER BY created_at ASC, id ASC`,
    [shopId, integrationId, conversationId],
  ));
  const messages = rows
    .map((row) => parseStoredMessage(row.payload_json, conversationId))
    .filter((row): row is WaMessage => Boolean(row));
  try {
    mmkvStorage.setItem(
      whatsappMessageCacheKey(shopId, integrationId, conversationId),
      JSON.stringify(messages),
    );
  } catch {
    // SQLite remains authoritative if the fast-start cache cannot be written.
  }
  return messages;
}

function mapPendingOperation(row: PendingOperationRow): PendingWhatsAppOperation | null {
  const payload = parseJson<PendingWhatsAppOperation["payload"]>(row.payload_json);
  if (!payload) return null;
  return {
    id: row.id,
    shopId: row.shop_id,
    integrationId: row.integration_id,
    conversationId: row.conversation_id,
    clientMessageId: row.client_message_id,
    operationType: row.operation_type,
    operationState: row.operation_state,
    payload,
    attempt: row.attempt,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const whatsappDb = {
  initialize: initializeDatabase,

  async upsertConversations(
    scope: { shopId: string; integrationId: string; phoneNumberId?: string },
    conversations: WaConversation[],
  ) {
    await initializeDatabase();
    await sqliteClient.transaction(async (transaction) => {
      for (const conversation of conversations) {
        if (!isWaConversation(conversation)) continue;

        await transaction.run(
          `INSERT INTO wa_conversations (
            id, shop_id, integration_id, phone_number_id, customer_id, phone,
            contact_name, unread_count, is_archived, is_pinned, assigned_to_id,
            entity_version, updated_at, payload_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(shop_id, integration_id, id) DO UPDATE SET
            phone_number_id = excluded.phone_number_id,
            customer_id = excluded.customer_id,
            phone = excluded.phone,
            contact_name = excluded.contact_name,
            unread_count = excluded.unread_count,
            is_archived = excluded.is_archived,
            is_pinned = excluded.is_pinned,
            assigned_to_id = excluded.assigned_to_id,
            entity_version = excluded.entity_version,
            updated_at = excluded.updated_at,
            payload_json = excluded.payload_json
          WHERE excluded.entity_version >= wa_conversations.entity_version`,
          [
            conversation.id,
            scope.shopId,
            scope.integrationId,
            scope.phoneNumberId || null,
            conversation.customerId || null,
            conversation.phone,
            conversation.contactName || null,
            conversation.unreadCount,
            conversation.isArchived ? 1 : 0,
            conversation.isPinned ? 1 : 0,
            conversation.assignedToId || null,
            conversation.entityVersion || 0,
            timestamp(conversation.updatedAt || conversation.lastCustomerMessageAt),
            JSON.stringify(conversation),
          ],
        );
      }
    });
    await refreshFastConversationSnapshot(scope.shopId, scope.integrationId);
  },

  getFastConversations(shopId: string, integrationId: string): WaConversation[] {
    try {
      const cached = mmkvStorage.getItem(
        whatsappConversationCacheKey(shopId, integrationId),
      ) as string | null;
      if (cached && typeof cached === "string") {
        const parsed: unknown = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (item): item is WaConversation => isWaConversation(item),
          );
        }
      }
    } catch (e) {}
    return [];
  },

  getFastCapability(shopId?: string | null): WhatsAppCapability | null {
    if (!shopId) return null;
    try {
      const cached = mmkvStorage.getItem(`wa_fast_cap_${shopId}`) as string | null;
      if (cached && typeof cached === "string") {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === "object") return parsed as WhatsAppCapability;
      }
    } catch {}
    return null;
  },

  saveFastCapability(shopId: string, capability: WhatsAppCapability) {
    try {
      mmkvStorage.setItem(`wa_fast_cap_${shopId}`, JSON.stringify(capability));
    } catch {}
  },

  getFastMessages(
    shopId: string,
    integrationId: string,
    conversationId: string,
  ): WaMessage[] {
    try {
      const cached = mmkvStorage.getItem(
        whatsappMessageCacheKey(shopId, integrationId, conversationId),
      ) as string | null;
      if (cached && typeof cached === "string") {
        const parsed: unknown = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (item): item is WaMessage => isWaMessage(item, conversationId),
          );
        }
      }
    } catch {}
    return [];
  },

  async getConversations(shopId: string, integrationId: string) {
    await initializeDatabase();
    return refreshFastConversationSnapshot(shopId, integrationId);
  },

  async getConversation(
    shopId: string,
    integrationId: string,
    conversationId: string,
  ) {
    await initializeDatabase();
    const row = await sqliteClient.read((database) => database.first<ConversationRow>(
      `SELECT payload_json
       FROM wa_conversations
       WHERE shop_id = ? AND integration_id = ? AND id = ?`,
      [shopId, integrationId, conversationId],
    ));
    return row ? parseStoredConversation(row.payload_json) : null;
  },

  async getMessage(
    shopId: string,
    integrationId: string,
    conversationId: string,
    messageId: string,
    clientMessageId?: string,
  ) {
    await initializeDatabase();
    const row = await sqliteClient.read((database) => database.first<MessageRow>(
      `SELECT payload_json
       FROM wa_messages
       WHERE shop_id = ?
         AND integration_id = ?
         AND conversation_id = ?
         AND (id = ? OR (? IS NOT NULL AND client_message_id = ?))
       LIMIT 1`,
      [
        shopId,
        integrationId,
        conversationId,
        messageId,
        clientMessageId || null,
        clientMessageId || null,
      ],
    ));
    return row ? parseStoredMessage(row.payload_json, conversationId) : null;
  },

  async linkCustomerToConversation(
    shopId: string,
    integrationId: string,
    conversationId: string,
    customerId: string | null,
  ) {
    await initializeDatabase();
    const scope = await sqliteClient.write(async (database) => {
      await database.run(
        `UPDATE wa_conversations
         SET customer_id = ?
         WHERE shop_id = ? AND integration_id = ? AND id = ?`,
        [customerId, shopId, integrationId, conversationId],
      );
      const row = await database.first<ConversationRow & { shop_id: string; integration_id: string }>(
        `SELECT shop_id, integration_id, payload_json
         FROM wa_conversations
         WHERE shop_id = ? AND integration_id = ? AND id = ?`,
        [shopId, integrationId, conversationId],
      );
      if (row?.payload_json) {
        const parsed = parseStoredConversation(row.payload_json);
        if (parsed) {
          parsed.customerId = customerId || undefined;
          await database.run(
            `UPDATE wa_conversations
             SET payload_json = ?
             WHERE shop_id = ? AND integration_id = ? AND id = ?`,
            [JSON.stringify(parsed), shopId, integrationId, conversationId],
          );
        }
      }
      return row ? { shopId: row.shop_id, integrationId: row.integration_id } : null;
    });
    if (scope) await refreshFastConversationSnapshot(scope.shopId, scope.integrationId);
  },

  async removeConversation(shopId: string, integrationId: string, conversationId: string) {
    await initializeDatabase();
    const scope = await sqliteClient.transaction(async (transaction) => {
      const row = await transaction.first<{ shop_id: string; integration_id: string }>(
        `SELECT shop_id, integration_id
         FROM wa_conversations
         WHERE shop_id = ? AND integration_id = ? AND id = ?`,
        [shopId, integrationId, conversationId],
      );
      await transaction.run(
        "DELETE FROM wa_messages WHERE shop_id = ? AND integration_id = ? AND conversation_id = ?",
        [shopId, integrationId, conversationId],
      );
      await transaction.run(
        "DELETE FROM wa_drafts WHERE shop_id = ? AND integration_id = ? AND conversation_id = ?",
        [shopId, integrationId, conversationId],
      );
      await transaction.run(
        "DELETE FROM wa_pending_operations WHERE shop_id = ? AND integration_id = ? AND conversation_id = ?",
        [shopId, integrationId, conversationId],
      );
      await transaction.run(
        `DELETE FROM wa_conversations
         WHERE shop_id = ? AND integration_id = ? AND id = ?`,
        [shopId, integrationId, conversationId],
      );
      return row ? { shopId: row.shop_id, integrationId: row.integration_id } : null;
    });
    if (scope) {
      await refreshFastConversationSnapshot(scope.shopId, scope.integrationId);
      mmkvStorage.removeItem(
        whatsappMessageCacheKey(shopId, integrationId, conversationId),
      );
    }
  },

  async upsertMessages(
    scope: { shopId: string; integrationId: string; conversationId: string },
    messages: WaMessage[],
  ) {
    await initializeDatabase();
    await sqliteClient.transaction(async (transaction) => {
      for (const message of messages) {
        if (!isWaMessage(message, scope.conversationId)) continue;
        if (message.clientMessageId) {
          const replaced = await transaction.all<{ id: string }>(
            `SELECT id FROM wa_messages
             WHERE integration_id = ? AND client_message_id = ? AND id != ?`,
            [scope.integrationId, message.clientMessageId, message.id],
          );
          for (const local of replaced) {
            await transaction.run(
              "DELETE FROM wa_message_status_history WHERE message_id = ?",
              [local.id],
            );
            try {
              await transaction.run(
                "DELETE FROM wa_message_search WHERE message_id = ?",
                [local.id],
              );
            } catch {
              // FTS is optional.
            }
          }
          await transaction.run(
            `DELETE FROM wa_messages
             WHERE integration_id = ? AND client_message_id = ? AND id != ?`,
            [scope.integrationId, message.clientMessageId, message.id],
          );
        }
        await transaction.run(
          `INSERT INTO wa_messages (
            id, shop_id, integration_id, conversation_id, client_message_id,
            provider_message_id, direction, message_type, operation_state,
            provider_status, content_state, entity_version, created_at, payload_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            client_message_id = excluded.client_message_id,
            provider_message_id = excluded.provider_message_id,
            operation_state = excluded.operation_state,
            provider_status = excluded.provider_status,
            content_state = excluded.content_state,
            entity_version = excluded.entity_version,
            payload_json = excluded.payload_json
          WHERE excluded.entity_version >= wa_messages.entity_version`,
          [
            message.id,
            scope.shopId,
            scope.integrationId,
            scope.conversationId,
            message.clientMessageId || null,
            message.metaMessageId || null,
            message.direction,
            message.type,
            message.operationState || null,
            message.providerStatus || null,
            message.contentState || null,
            message.entityVersion || 0,
            timestamp(message.createdAt),
            JSON.stringify(message),
          ],
        );

        if (message.providerStatus && message.providerStatusAt) {
          await transaction.run(
            `INSERT OR IGNORE INTO wa_message_status_history (
              message_id, attempt, provider_status, provider_status_at, entity_version
            ) VALUES (?, ?, ?, ?, ?)`,
            [
              message.id,
              message.attempt || 1,
              message.providerStatus,
              timestamp(message.providerStatusAt),
              message.entityVersion || 0,
            ],
          );
        }
        const searchableBody = [
          message.content?.text,
          message.content?.caption,
          message.templateName,
        ].filter((value): value is string => typeof value === "string" && value.length > 0).join(" ");
        if (searchableBody) {
          try {
            await transaction.run(
              "DELETE FROM wa_message_search WHERE message_id = ?",
              [message.id],
            );
            await transaction.run(
              "INSERT INTO wa_message_search(message_id, conversation_id, body) VALUES (?, ?, ?)",
              [message.id, scope.conversationId, searchableBody],
            );
          } catch {
            // FTS is optional and may not be compiled into the installed SQLite runtime.
          }
        }
      }
    });
    await refreshFastMessageSnapshot(
      scope.shopId,
      scope.integrationId,
      scope.conversationId,
    );
  },

  async getMessages(shopId: string, integrationId: string, conversationId: string) {
    await initializeDatabase();
    const rows = await sqliteClient.read((database) => database.all<MessageRow>(
      `SELECT payload_json
       FROM (
         SELECT id, created_at, payload_json
         FROM wa_messages
         WHERE shop_id = ? AND integration_id = ? AND conversation_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?
       )
       ORDER BY created_at ASC, id ASC`,
      [shopId, integrationId, conversationId, LOCAL_PAGE_LIMIT],
    ));
    return rows
      .map((row) => parseStoredMessage(row.payload_json, conversationId))
      .filter((row): row is WaMessage => Boolean(row));
  },

  async saveDraft(
    scope: { shopId: string; integrationId: string; conversationId: string },
    text: string,
    replyToMessageId?: string,
  ) {
    await initializeDatabase();
    if (!text.trim() && !replyToMessageId) {
      await sqliteClient.write((database) => database.run(
        "DELETE FROM wa_drafts WHERE shop_id = ? AND integration_id = ? AND conversation_id = ?",
        [scope.shopId, scope.integrationId, scope.conversationId],
      ));
      return;
    }
    await sqliteClient.write((database) => database.run(
      `INSERT INTO wa_drafts (
        shop_id, integration_id, conversation_id, text, reply_to_message_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(shop_id, integration_id, conversation_id) DO UPDATE SET
        text = excluded.text,
        reply_to_message_id = excluded.reply_to_message_id,
        updated_at = excluded.updated_at`,
      [
        scope.shopId,
        scope.integrationId,
        scope.conversationId,
        text,
        replyToMessageId || null,
        Date.now(),
      ],
    ));
  },

  async getDraft(shopId: string, integrationId: string, conversationId: string) {
    await initializeDatabase();
    return sqliteClient.read((database) => database.first<{
      text: string;
      reply_to_message_id: string | null;
      updated_at: number;
    }>(
      `SELECT text, reply_to_message_id, updated_at
       FROM wa_drafts
       WHERE shop_id = ? AND integration_id = ? AND conversation_id = ?`,
      [shopId, integrationId, conversationId],
    ));
  },

  async enqueueOperation(operation: PendingWhatsAppOperation) {
    await initializeDatabase();
    await sqliteClient.write((database) => database.run(
      `INSERT INTO wa_pending_operations (
        id, shop_id, integration_id, conversation_id, client_message_id,
        operation_type, operation_state, payload_json, attempt,
        next_attempt_at, last_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        operation_state = excluded.operation_state,
        payload_json = excluded.payload_json,
        attempt = excluded.attempt,
        next_attempt_at = excluded.next_attempt_at,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at`,
      [
        operation.id,
        operation.shopId,
        operation.integrationId,
        operation.conversationId,
        operation.clientMessageId,
        operation.operationType,
        operation.operationState,
        JSON.stringify(operation.payload),
        operation.attempt,
        operation.nextAttemptAt,
        operation.lastError || null,
        operation.createdAt,
        operation.updatedAt,
      ],
    ));
  },

  async persistPendingMessageAndOperation(
    scope: { shopId: string; integrationId: string; conversationId: string },
    message: WaMessage,
    operation: PendingWhatsAppOperation,
  ) {
    await initializeDatabase();
    await sqliteClient.transaction(async (transaction) => {
      await transaction.run(
        `INSERT INTO wa_messages (
          id, shop_id, integration_id, conversation_id, client_message_id,
          provider_message_id, direction, message_type, operation_state,
          provider_status, content_state, entity_version, created_at, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          operation_state = excluded.operation_state,
          provider_status = excluded.provider_status,
          content_state = excluded.content_state,
          payload_json = excluded.payload_json`,
        [
          message.id,
          scope.shopId,
          scope.integrationId,
          scope.conversationId,
          message.clientMessageId || null,
          message.metaMessageId || null,
          message.direction,
          message.type,
          message.operationState || null,
          message.providerStatus || null,
          message.contentState || null,
          message.entityVersion || 0,
          timestamp(message.createdAt),
          JSON.stringify(message),
        ],
      );
      await transaction.run(
        `INSERT INTO wa_pending_operations (
          id, shop_id, integration_id, conversation_id, client_message_id,
          operation_type, operation_state, payload_json, attempt,
          next_attempt_at, last_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          operation_state = excluded.operation_state,
          payload_json = excluded.payload_json,
          attempt = excluded.attempt,
          next_attempt_at = excluded.next_attempt_at,
          last_error = excluded.last_error,
          updated_at = excluded.updated_at`,
        [
          operation.id,
          operation.shopId,
          operation.integrationId,
          operation.conversationId,
          operation.clientMessageId,
          operation.operationType,
          operation.operationState,
          JSON.stringify(operation.payload),
          operation.attempt,
          operation.nextAttemptAt,
          operation.lastError || null,
          operation.createdAt,
          operation.updatedAt,
        ],
      );
    });
    await refreshFastMessageSnapshot(
      scope.shopId,
      scope.integrationId,
      scope.conversationId,
    );
  },

  async requeueOperationByClientMessageId(
    integrationId: string,
    clientMessageId: string,
  ) {
    await initializeDatabase();
    const operation = await sqliteClient.read((database) =>
      database.first<{ id: string; attempt: number }>(
        `SELECT id, attempt
         FROM wa_pending_operations
         WHERE integration_id = ? AND client_message_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [integrationId, clientMessageId],
      ),
    );
    if (!operation) return false;
    await sqliteClient.write((database) => database.run(
      `UPDATE wa_pending_operations
       SET operation_state = 'RETRY_SCHEDULED',
           next_attempt_at = ?,
           last_error = NULL,
           updated_at = ?
       WHERE id = ?`,
      [Date.now(), Date.now(), operation.id],
    ));
    return true;
  },

  async getReadyOperations(shopId: string, integrationId: string) {
    await initializeDatabase();
    const now = Date.now();
    const staleActiveCutoff = now - 60_000;
    const rows = await sqliteClient.read((database) => database.all<PendingOperationRow>(
      `SELECT *
       FROM wa_pending_operations
       WHERE shop_id = ?
         AND integration_id = ?
         AND operation_state IN ('WAITING_FOR_NETWORK', 'UPLOADING', 'RETRY_SCHEDULED', 'SUBMITTING')
         AND next_attempt_at <= ?
         AND (
           operation_state NOT IN ('UPLOADING', 'SUBMITTING')
           OR updated_at <= ?
         )
       ORDER BY created_at ASC
       LIMIT 25`,
      [shopId, integrationId, now, staleActiveCutoff],
    ));
    return rows
      .map(mapPendingOperation)
      .filter((row): row is PendingWhatsAppOperation => Boolean(row));
  },

  async updateOperation(
    id: string,
    update: Pick<PendingWhatsAppOperation, "operationState" | "attempt" | "nextAttemptAt"> & {
      lastError?: string;
      payload?: PendingWhatsAppOperation["payload"];
    },
  ) {
    await initializeDatabase();
    await sqliteClient.write((database) => database.run(
      `UPDATE wa_pending_operations
       SET operation_state = ?, attempt = ?, next_attempt_at = ?,
           last_error = ?, payload_json = COALESCE(?, payload_json), updated_at = ?
       WHERE id = ?`,
      [
        update.operationState,
        update.attempt,
        update.nextAttemptAt,
        update.lastError || null,
        update.payload === undefined ? null : JSON.stringify(update.payload),
        Date.now(),
        id,
      ],
    ));
  },

  async deleteOperation(id: string) {
    await initializeDatabase();
    await sqliteClient.write((database) => database.run(
      "DELETE FROM wa_pending_operations WHERE id = ?",
      [id],
    ));
  },

  async setSyncState(
    shopId: string,
    integrationId: string,
    state: {
      streamCursor?: string | null;
      conversationSnapshotCursor?: string | null;
    },
  ) {
    await initializeDatabase();
    await sqliteClient.write((database) => database.run(
      `INSERT INTO wa_sync_state (
        shop_id, integration_id, stream_cursor, conversation_snapshot_cursor, last_reconciled_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(shop_id, integration_id) DO UPDATE SET
        stream_cursor = COALESCE(excluded.stream_cursor, wa_sync_state.stream_cursor),
        conversation_snapshot_cursor = COALESCE(
          excluded.conversation_snapshot_cursor,
          wa_sync_state.conversation_snapshot_cursor
        ),
        last_reconciled_at = excluded.last_reconciled_at`,
      [
        shopId,
        integrationId,
        state.streamCursor || null,
        state.conversationSnapshotCursor || null,
        Date.now(),
      ],
    ));
  },

  async supportsFts5() {
    await initializeDatabase();
    return sqliteClient.write(async (database) => {
      try {
        await database.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS wa_message_search
          USING fts5(message_id UNINDEXED, conversation_id UNINDEXED, body);
        `);
        return true;
      } catch {
        return false;
      }
    });
  },

  async searchMessages(
    shopId: string,
    integrationId: string,
    query: string,
    limit = 100,
  ) {
    await initializeDatabase();
    const tokens = query
      .trim()
      .split(/\s+/)
      .map((token) => token.replace(/["'*:^(){}[\]]/g, ""))
      .filter(Boolean);
    if (tokens.length === 0) return [] as WaMessage[];
    try {
      const match = tokens.map((token) => `"${token}"*`).join(" AND ");
      const rows = await sqliteClient.read((database) => database.all<MessageRow>(
        `SELECT messages.payload_json
         FROM wa_message_search AS search
         JOIN wa_messages AS messages ON messages.id = search.message_id
         WHERE wa_message_search MATCH ?
           AND messages.shop_id = ?
           AND messages.integration_id = ?
         ORDER BY messages.created_at DESC
         LIMIT ?`,
        [match, shopId, integrationId, limit],
      ));
      return rows
        .map((row) => parseJson<WaMessage>(row.payload_json))
        .filter((row): row is WaMessage => Boolean(row));
    } catch {
      const pattern = `%${query.trim()}%`;
      const rows = await sqliteClient.read((database) => database.all<MessageRow>(
        `SELECT payload_json
         FROM wa_messages
         WHERE shop_id = ?
           AND integration_id = ?
           AND payload_json LIKE ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [shopId, integrationId, pattern, limit],
      ));
      return rows
        .map((row) => parseJson<WaMessage>(row.payload_json))
        .filter((row): row is WaMessage => Boolean(row));
    }
  },

  async cleanup(options: {
    messageTextRetentionDays: number | null;
    mediaFileRetentionDays: number;
    thumbnailRetentionDays: number;
    failedOperationRetentionDays: number;
    draftRetentionDays: number;
  }) {
    await initializeDatabase();
    const day = 86_400_000;
    const now = Date.now();
    await sqliteClient.transaction(async (transaction) => {
      if (options.messageTextRetentionDays != null) {
        await transaction.run(
          "DELETE FROM wa_messages WHERE created_at < ?",
          [now - options.messageTextRetentionDays * day],
        );
      }
      await transaction.run(
        "DELETE FROM wa_drafts WHERE updated_at < ?",
        [now - options.draftRetentionDays * day],
      );
      await transaction.run(
        `DELETE FROM wa_pending_operations
         WHERE operation_state = 'TERMINALLY_FAILED' AND updated_at < ?`,
        [now - options.failedOperationRetentionDays * day],
      );
      await transaction.run(
        "DELETE FROM wa_media_cache WHERE last_accessed_at < ?",
        [now - Math.max(options.mediaFileRetentionDays, options.thumbnailRetentionDays) * day],
      );
    });
  },
};
