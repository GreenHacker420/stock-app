import type { WaBroadcastTemplateBinding } from "../../../api/whatsapp-broadcast.api";
import { sqliteClient } from "../../../database/sqlite-client";

export type LocalBroadcastDraft = {
  shopId: string;
  integrationId: string;
  step: number;
  selectedContactIds: string[];
  manualRecipients: Array<{ id: string; name: string; phone: string }>;
  templateId?: string;
  bindings: WaBroadcastTemplateBinding[];
  headerAsset?: {
    id: string;
    fileName: string;
    kind: "IMAGE" | "VIDEO" | "DOCUMENT";
  } | null;
  campaignName: string;
  updatedAt: number;
};

let schemaPromise: Promise<void> | null = null;

function initializeDatabase() {
  if (!schemaPromise) {
    schemaPromise = sqliteClient.write((database) => database.exec(`
      CREATE TABLE IF NOT EXISTS wa_broadcast_drafts (
        draftKey TEXT PRIMARY KEY NOT NULL,
        shopId TEXT NOT NULL,
        integrationId TEXT NOT NULL,
        payload TEXT NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_wa_broadcast_drafts_scope
        ON wa_broadcast_drafts (shopId, integrationId, updatedAt);
    `));
  }
  return schemaPromise;
}

function draftKey(shopId: string, integrationId: string) {
  return `${shopId}:${integrationId}`;
}

function isDraft(value: unknown): value is LocalBroadcastDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<LocalBroadcastDraft>;
  return typeof draft.shopId === "string"
    && typeof draft.integrationId === "string"
    && Number.isInteger(draft.step)
    && Array.isArray(draft.selectedContactIds)
    && Array.isArray(draft.manualRecipients)
    && Array.isArray(draft.bindings)
    && typeof draft.campaignName === "string"
    && typeof draft.updatedAt === "number";
}

export const broadcastDraftDb = {
  async get(shopId: string, integrationId: string): Promise<LocalBroadcastDraft | null> {
    await initializeDatabase();
    const row = await sqliteClient.read((database) => database.first<{ payload: string }>(
      "SELECT payload FROM wa_broadcast_drafts WHERE draftKey = ? LIMIT 1",
      [draftKey(shopId, integrationId)],
    ));
    if (!row?.payload) return null;
    try {
      const parsed = JSON.parse(row.payload);
      return isDraft(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },

  async save(draft: LocalBroadcastDraft) {
    await initializeDatabase();
    const payload = JSON.stringify(draft);
    await sqliteClient.write((database) => database.run(`
      INSERT INTO wa_broadcast_drafts (draftKey, shopId, integrationId, payload, updatedAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(draftKey) DO UPDATE SET
        payload = excluded.payload,
        updatedAt = excluded.updatedAt
    `, [draftKey(draft.shopId, draft.integrationId), draft.shopId, draft.integrationId, payload, draft.updatedAt]));
  },

  async clear(shopId: string, integrationId: string) {
    await initializeDatabase();
    await sqliteClient.write((database) => database.run(
      "DELETE FROM wa_broadcast_drafts WHERE draftKey = ?",
      [draftKey(shopId, integrationId)],
    ));
  },
};
