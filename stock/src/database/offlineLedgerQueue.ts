import { sqliteClient } from "./sqlite-client";

export interface QueuedLedgerMutation {
  id: string;
  type: "OPENING_BALANCE" | "MANUAL_ADJUSTMENT" | "REVERSE_ENTRY";
  shopId: string;
  customerId: string;
  clientMutationId: string;
  payloadJson: string;
  status: "QUEUED" | "UPLOADING_ATTACHMENTS" | "READY_TO_SUBMIT" | "SUBMITTING" | "CONFIRMED" | "FAILED_RETRYABLE" | "FAILED_PERMANENT";
  attemptCount: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

let isInitialized = false;

async function ensureTableInitialized() {
  if (isInitialized) return;
  await sqliteClient.write(async (db) => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS queued_ledger_mutations (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        shopId TEXT NOT NULL,
        customerId TEXT NOT NULL,
        clientMutationId TEXT NOT NULL UNIQUE,
        payloadJson TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'QUEUED',
        attemptCount INTEGER NOT NULL DEFAULT 0,
        lastError TEXT,
        nextRetryAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_queued_mutations_status ON queued_ledger_mutations(status, shopId);
    `);
    // Backward-compatible column add for existing installs
    try {
      await db.exec(`ALTER TABLE queued_ledger_mutations ADD COLUMN nextRetryAt TEXT;`);
    } catch {
      // column already exists
    }
  });
  isInitialized = true;
}

export async function enqueueLedgerMutation(mutation: {
  id: string;
  type: "OPENING_BALANCE" | "MANUAL_ADJUSTMENT" | "REVERSE_ENTRY";
  shopId: string;
  customerId: string;
  clientMutationId: string;
  payload: any;
}): Promise<QueuedLedgerMutation> {
  await ensureTableInitialized();
  const now = new Date().toISOString();
  const payloadJson = JSON.stringify(mutation.payload);

  await sqliteClient.write(async (db) => {
    await db.run(
      `INSERT INTO queued_ledger_mutations (id, type, shopId, customerId, clientMutationId, payloadJson, status, attemptCount, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', 0, ?, ?)
       ON CONFLICT(clientMutationId) DO UPDATE SET updatedAt = excluded.updatedAt;`,
      [mutation.id, mutation.type, mutation.shopId, mutation.customerId, mutation.clientMutationId, payloadJson, now, now]
    );
  });

  return {
    id: mutation.id,
    type: mutation.type,
    shopId: mutation.shopId,
    customerId: mutation.customerId,
    clientMutationId: mutation.clientMutationId,
    payloadJson,
    status: "QUEUED",
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getPendingMutations(shopId: string): Promise<QueuedLedgerMutation[]> {
  await ensureTableInitialized();
  const now = new Date().toISOString();
  return sqliteClient.read(async (db) => {
    return db.all<QueuedLedgerMutation>(
      `SELECT * FROM queued_ledger_mutations
       WHERE shopId = ?
         AND status IN ('QUEUED', 'FAILED_RETRYABLE', 'READY_TO_SUBMIT')
         AND (nextRetryAt IS NULL OR nextRetryAt <= ?)
       ORDER BY createdAt ASC;`,
      [shopId, now]
    );
  });
}

export async function updateMutationStatus(
  id: string,
  status: QueuedLedgerMutation["status"],
  lastError?: string,
  nextRetryAt?: string | null
): Promise<void> {
  await ensureTableInitialized();
  const now = new Date().toISOString();
  await sqliteClient.write(async (db) => {
    await db.run(
      `UPDATE queued_ledger_mutations
       SET status = ?, attemptCount = attemptCount + 1, lastError = ?, nextRetryAt = ?, updatedAt = ?
       WHERE id = ?;`,
      [status, lastError || null, nextRetryAt ?? null, now, id]
    );
  });
}

export async function clearConfirmedMutations(shopId: string): Promise<void> {
  await ensureTableInitialized();
  await sqliteClient.write(async (db) => {
    await db.run(`DELETE FROM queued_ledger_mutations WHERE shopId = ? AND status = 'CONFIRMED';`, [shopId]);
  });
}
