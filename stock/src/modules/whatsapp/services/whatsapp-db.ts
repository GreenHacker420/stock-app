import * as SQLite from "expo-sqlite";
import type {
  WaConversation,
  WaMessage,
  WaOperationState,
  WaOutboundMessage,
} from "../../../api/whatsapp.api";

const DATABASE_NAME = "whatsapp_platform.db";
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

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function serializeWrite<T>(task: () => Promise<T>) {
  const run = async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await task();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryable = /database is locked|cannot start a transaction|cannot rollback/i.test(message);
        if (!retryable || attempt >= 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 25 * (2 ** attempt)));
      }
    }
  };
  const result = writeQueue.then(run, run);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function openDatabase() {
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS wa_conversations (
      id TEXT PRIMARY KEY NOT NULL,
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
      payload_json TEXT NOT NULL
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
  return database;
}

function getDatabase() {
  if (!databasePromise) databasePromise = openDatabase();
  return databasePromise;
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
  initialize: getDatabase,

  async upsertConversations(
    scope: { shopId: string; integrationId: string; phoneNumberId?: string },
    conversations: WaConversation[],
  ) {
    const database = await getDatabase();
    await serializeWrite(() => database.withExclusiveTransactionAsync(async (transaction) => {
      for (const conversation of conversations) {
        await transaction.runAsync(
          `INSERT INTO wa_conversations (
            id, shop_id, integration_id, phone_number_id, customer_id, phone,
            contact_name, unread_count, is_archived, is_pinned, assigned_to_id,
            entity_version, updated_at, payload_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
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
    }));
  },

  async getConversations(shopId: string, integrationId: string) {
    const database = await getDatabase();
    const rows = await database.getAllAsync<ConversationRow>(
      `SELECT payload_json
       FROM wa_conversations
       WHERE shop_id = ? AND integration_id = ?
       ORDER BY updated_at DESC, id DESC
       LIMIT ?`,
      [shopId, integrationId, LOCAL_PAGE_LIMIT],
    );
    return rows
      .map((row) => parseJson<WaConversation>(row.payload_json))
      .filter((row): row is WaConversation => Boolean(row));
  },

  async removeConversation(conversationId: string) {
    const database = await getDatabase();
    await serializeWrite(() => database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync("DELETE FROM wa_messages WHERE conversation_id = ?", conversationId);
      await transaction.runAsync("DELETE FROM wa_drafts WHERE conversation_id = ?", conversationId);
      await transaction.runAsync("DELETE FROM wa_pending_operations WHERE conversation_id = ?", conversationId);
      await transaction.runAsync("DELETE FROM wa_conversations WHERE id = ?", conversationId);
    }));
  },

  async upsertMessages(
    scope: { shopId: string; integrationId: string; conversationId: string },
    messages: WaMessage[],
  ) {
    const database = await getDatabase();
    await serializeWrite(() => database.withExclusiveTransactionAsync(async (transaction) => {
      for (const message of messages) {
        if (message.clientMessageId) {
          const replaced = await transaction.getAllAsync<{ id: string }>(
            `SELECT id FROM wa_messages
             WHERE integration_id = ? AND client_message_id = ? AND id != ?`,
            [scope.integrationId, message.clientMessageId, message.id],
          );
          for (const local of replaced) {
            await transaction.runAsync(
              "DELETE FROM wa_message_status_history WHERE message_id = ?",
              local.id,
            );
            try {
              await transaction.runAsync(
                "DELETE FROM wa_message_search WHERE message_id = ?",
                local.id,
              );
            } catch {
              // FTS is optional.
            }
          }
          await transaction.runAsync(
            `DELETE FROM wa_messages
             WHERE integration_id = ? AND client_message_id = ? AND id != ?`,
            [scope.integrationId, message.clientMessageId, message.id],
          );
        }
        await transaction.runAsync(
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
          await transaction.runAsync(
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
            await transaction.runAsync(
              "DELETE FROM wa_message_search WHERE message_id = ?",
              message.id,
            );
            await transaction.runAsync(
              "INSERT INTO wa_message_search(message_id, conversation_id, body) VALUES (?, ?, ?)",
              [message.id, scope.conversationId, searchableBody],
            );
          } catch {
            // FTS is optional and may not be compiled into the installed SQLite runtime.
          }
        }
      }
    }));
  },

  async getMessages(conversationId: string) {
    const database = await getDatabase();
    const rows = await database.getAllAsync<MessageRow>(
      `SELECT payload_json
       FROM (
         SELECT id, created_at, payload_json
         FROM wa_messages
         WHERE conversation_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?
       )
       ORDER BY created_at ASC, id ASC`,
      [conversationId, LOCAL_PAGE_LIMIT],
    );
    return rows
      .map((row) => parseJson<WaMessage>(row.payload_json))
      .filter((row): row is WaMessage => Boolean(row));
  },

  async saveDraft(
    scope: { shopId: string; integrationId: string; conversationId: string },
    text: string,
    replyToMessageId?: string,
  ) {
    const database = await getDatabase();
    if (!text.trim() && !replyToMessageId) {
      await serializeWrite(() => database.runAsync(
        "DELETE FROM wa_drafts WHERE shop_id = ? AND integration_id = ? AND conversation_id = ?",
        [scope.shopId, scope.integrationId, scope.conversationId],
      ));
      return;
    }
    await serializeWrite(() => database.runAsync(
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
    const database = await getDatabase();
    return database.getFirstAsync<{
      text: string;
      reply_to_message_id: string | null;
      updated_at: number;
    }>(
      `SELECT text, reply_to_message_id, updated_at
       FROM wa_drafts
       WHERE shop_id = ? AND integration_id = ? AND conversation_id = ?`,
      [shopId, integrationId, conversationId],
    );
  },

  async enqueueOperation(operation: PendingWhatsAppOperation) {
    const database = await getDatabase();
    await serializeWrite(() => database.runAsync(
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

  async getReadyOperations(shopId: string, integrationId: string) {
    const database = await getDatabase();
    const rows = await database.getAllAsync<PendingOperationRow>(
      `SELECT *
       FROM wa_pending_operations
       WHERE shop_id = ?
         AND integration_id = ?
         AND operation_state IN ('WAITING_FOR_NETWORK', 'UPLOADING', 'RETRY_SCHEDULED', 'SUBMITTING')
         AND next_attempt_at <= ?
       ORDER BY created_at ASC
       LIMIT 25`,
      [shopId, integrationId, Date.now()],
    );
    return rows
      .map(mapPendingOperation)
      .filter((row): row is PendingWhatsAppOperation => Boolean(row));
  },

  async updateOperation(
    id: string,
    update: Pick<PendingWhatsAppOperation, "operationState" | "attempt" | "nextAttemptAt"> & {
      lastError?: string;
    },
  ) {
    const database = await getDatabase();
    await serializeWrite(() => database.runAsync(
      `UPDATE wa_pending_operations
       SET operation_state = ?, attempt = ?, next_attempt_at = ?,
           last_error = ?, updated_at = ?
       WHERE id = ?`,
      [
        update.operationState,
        update.attempt,
        update.nextAttemptAt,
        update.lastError || null,
        Date.now(),
        id,
      ],
    ));
  },

  async deleteOperation(id: string) {
    const database = await getDatabase();
    await serializeWrite(() => database.runAsync(
      "DELETE FROM wa_pending_operations WHERE id = ?",
      id,
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
    const database = await getDatabase();
    await serializeWrite(() => database.runAsync(
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
    const database = await getDatabase();
    return serializeWrite(async () => {
      try {
        await database.execAsync(`
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
    const database = await getDatabase();
    const tokens = query
      .trim()
      .split(/\s+/)
      .map((token) => token.replace(/["'*:^(){}[\]]/g, ""))
      .filter(Boolean);
    if (tokens.length === 0) return [] as WaMessage[];
    try {
      const match = tokens.map((token) => `"${token}"*`).join(" AND ");
      const rows = await database.getAllAsync<MessageRow>(
        `SELECT messages.payload_json
         FROM wa_message_search AS search
         JOIN wa_messages AS messages ON messages.id = search.message_id
         WHERE wa_message_search MATCH ?
           AND messages.shop_id = ?
           AND messages.integration_id = ?
         ORDER BY messages.created_at DESC
         LIMIT ?`,
        [match, shopId, integrationId, limit],
      );
      return rows
        .map((row) => parseJson<WaMessage>(row.payload_json))
        .filter((row): row is WaMessage => Boolean(row));
    } catch {
      const pattern = `%${query.trim()}%`;
      const rows = await database.getAllAsync<MessageRow>(
        `SELECT payload_json
         FROM wa_messages
         WHERE shop_id = ?
           AND integration_id = ?
           AND payload_json LIKE ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [shopId, integrationId, pattern, limit],
      );
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
    const database = await getDatabase();
    const day = 86_400_000;
    const now = Date.now();
    await serializeWrite(() => database.withExclusiveTransactionAsync(async (transaction) => {
      if (options.messageTextRetentionDays != null) {
        await transaction.runAsync(
          "DELETE FROM wa_messages WHERE created_at < ?",
          now - options.messageTextRetentionDays * day,
        );
      }
      await transaction.runAsync(
        "DELETE FROM wa_drafts WHERE updated_at < ?",
        now - options.draftRetentionDays * day,
      );
      await transaction.runAsync(
        `DELETE FROM wa_pending_operations
         WHERE operation_state = 'TERMINALLY_FAILED' AND updated_at < ?`,
        now - options.failedOperationRetentionDays * day,
      );
      await transaction.runAsync(
        "DELETE FROM wa_media_cache WHERE last_accessed_at < ?",
        now - Math.max(options.mediaFileRetentionDays, options.thumbnailRetentionDays) * day,
      );
    }));
  },
};
