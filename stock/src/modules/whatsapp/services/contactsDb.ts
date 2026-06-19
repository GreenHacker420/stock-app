import * as SQLite from "expo-sqlite";

export interface LocalContact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  tag: "REGULAR" | "BUSINESS" | "NONE";
  customerId: string | null;
  syncState: "SYNCED" | "MUTATED" | "UNSYNCED";
  updatedAt: number;
}

let dbInstance: SQLite.SQLiteDatabase | null = null;

async function getDb() {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync("whatsapp_platform.db");
    // Initialize schema
    await dbInstance.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS local_contacts (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT,
        phone TEXT,
        email TEXT,
        tag TEXT DEFAULT 'NONE',
        customerId TEXT,
        syncState TEXT DEFAULT 'UNSYNCED',
        updatedAt INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_contacts_phone ON local_contacts (phone);
      CREATE INDEX IF NOT EXISTS idx_contacts_sync ON local_contacts (syncState);
    `);
  }
  return dbInstance;
}

export const contactsDb = {
  /**
   * Bulk upserts contacts read from device address book into local SQLite database.
   * Keeps existing user modifications (tag, customerId, syncState === 'MUTATED') unchanged.
   */
  upsertDeviceContacts: async (contacts: Array<{ id: string; name: string; phone: string; email?: string }>) => {
    const db = await getDb();
    const now = Date.now();
    
    await db.withTransactionAsync(async () => {
      for (const c of contacts) {
        // Check if contact already exists with user modifications
        const existing = await db.getFirstAsync<LocalContact>(
          "SELECT * FROM local_contacts WHERE id = ?",
          [c.id]
        );

        if (existing) {
          // If already locally modified, update details but keep status
          if (existing.syncState === "MUTATED") {
            await db.runAsync(
              "UPDATE local_contacts SET name = ?, phone = ?, email = ? WHERE id = ?",
              [c.name, c.phone, c.email || null, c.id]
            );
          } else {
            // Unmodified: update details and reset sync state
            await db.runAsync(
              "UPDATE local_contacts SET name = ?, phone = ?, email = ?, updatedAt = ? WHERE id = ?",
              [c.name, c.phone, c.email || null, now, c.id]
            );
          }
        } else {
          // Insert brand new contact
          await db.runAsync(
            "INSERT INTO local_contacts (id, name, phone, email, tag, customerId, syncState, updatedAt) VALUES (?, ?, ?, ?, 'NONE', NULL, 'UNSYNCED', ?)",
            [c.id, c.name, c.phone, c.email || null, now]
          );
        }
      }
    });
  },

  /**
   * Queries contacts locally from SQLite.
   */
  getContacts: async (searchQuery = ""): Promise<LocalContact[]> => {
    const db = await getDb();
    if (searchQuery.trim()) {
      const pattern = `%${searchQuery}%`;
      return await db.getAllAsync<LocalContact>(
        "SELECT * FROM local_contacts WHERE name LIKE ? OR phone LIKE ? ORDER BY name ASC",
        [pattern, pattern]
      );
    }
    return await db.getAllAsync<LocalContact>("SELECT * FROM local_contacts ORDER BY name ASC");
  },

  /**
   * Updates contact tag state.
   */
  updateTag: async (id: string, tag: "REGULAR" | "BUSINESS" | "NONE") => {
    const db = await getDb();
    await db.runAsync(
      "UPDATE local_contacts SET tag = ?, syncState = 'MUTATED', updatedAt = ? WHERE id = ?",
      [tag, Date.now(), id]
    );
  },

  /**
   * Links contact to an existing customer manually.
   */
  linkCustomer: async (id: string, customerId: string | null) => {
    const db = await getDb();
    await db.runAsync(
      "UPDATE local_contacts SET customerId = ?, syncState = 'MUTATED', updatedAt = ? WHERE id = ?",
      [customerId, Date.now(), id]
    );
  },

  /**
   * Fetches all mutated contacts that need to be synced to the backend.
   */
  getMutatedContacts: async (): Promise<LocalContact[]> => {
    const db = await getDb();
    return await db.getAllAsync<LocalContact>("SELECT * FROM local_contacts WHERE syncState = 'MUTATED' OR syncState = 'UNSYNCED'");
  },

  /**
   * Marks contacts as synced after successful API post.
   */
  markAsSynced: async (ids: string[]) => {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (const id of ids) {
        await db.runAsync(
          "UPDATE local_contacts SET syncState = 'SYNCED' WHERE id = ?",
          [id]
        );
      }
    });
  },
  
  /**
   * Resets local database
   */
  clearAll: async () => {
    const db = await getDb();
    await db.runAsync("DELETE FROM local_contacts");
  }
};
