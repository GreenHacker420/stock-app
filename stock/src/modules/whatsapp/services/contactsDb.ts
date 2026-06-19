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

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync("whatsapp_platform.db");
      // Initialize schema
      await db.execAsync(`
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
      return db;
    })();
  }
  return dbPromise;
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
      const statement = await db.prepareAsync(`
        INSERT INTO local_contacts (id, name, phone, email, tag, customerId, syncState, updatedAt)
        VALUES (?, ?, ?, ?, 'NONE', NULL, 'UNSYNCED', ?)
        ON CONFLICT(id) DO UPDATE SET
          name = CASE WHEN local_contacts.syncState = 'MUTATED' THEN local_contacts.name ELSE excluded.name END,
          phone = CASE WHEN local_contacts.syncState = 'MUTATED' THEN local_contacts.phone ELSE excluded.phone END,
          email = CASE WHEN local_contacts.syncState = 'MUTATED' THEN local_contacts.email ELSE COALESCE(excluded.email, local_contacts.email) END,
          updatedAt = CASE WHEN local_contacts.syncState = 'MUTATED' THEN local_contacts.updatedAt ELSE excluded.updatedAt END
      `);
      try {
        for (const c of contacts) {
          await statement.executeAsync([c.id, c.name, c.phone, c.email || null, now]);
        }
      } finally {
        await statement.finalizeAsync();
      }
    });
  },

  /**
   * Queries contacts locally from SQLite with pagination and filters.
   */
  getContacts: async (params: {
    searchQuery?: string;
    limit: number;
    offset: number;
    syncFilter: "ALL" | "UNSYNCED" | "SYNCED";
    linkFilter: "ALL" | "LINKED" | "UNLINKED";
    tagFilter: "ALL" | "REGULAR" | "BUSINESS" | "NONE";
    customerPhonesStr: string; // Comma separated string like ",phone1,phone2,"
  }): Promise<LocalContact[]> => {
    const db = await getDb();
    const { searchQuery = "", limit, offset, syncFilter, linkFilter, tagFilter, customerPhonesStr } = params;

    let query = "SELECT * FROM local_contacts WHERE 1=1";
    const sqlParams: any[] = [];

    if (searchQuery.trim()) {
      const pattern = `%${searchQuery.trim()}%`;
      query += " AND (name LIKE ? OR phone LIKE ?)";
      sqlParams.push(pattern, pattern);
    }

    if (syncFilter === "UNSYNCED") {
      query += " AND syncState != 'SYNCED'";
    } else if (syncFilter === "SYNCED") {
      query += " AND syncState = 'SYNCED'";
    }

    if (tagFilter !== "ALL") {
      query += " AND tag = ?";
      sqlParams.push(tagFilter);
    }

    if (linkFilter === "LINKED") {
      query += " AND (customerId IS NOT NULL OR (length(?) > 0 AND instr(?, ',' || substr(phone, -10) || ',') > 0))";
      sqlParams.push(customerPhonesStr, customerPhonesStr);
    } else if (linkFilter === "UNLINKED") {
      query += " AND customerId IS NULL AND (length(?) = 0 OR instr(?, ',' || substr(phone, -10) || ',') = 0)";
      sqlParams.push(customerPhonesStr, customerPhonesStr);
    }

    query += " ORDER BY name ASC LIMIT ? OFFSET ?";
    sqlParams.push(limit, offset);

    return await db.getAllAsync<LocalContact>(query, sqlParams);
  },

  /**
   * Gets list of all contact IDs matching active filters.
   * Useful for Select All bulk operations without loading full rows.
   */
  getFilteredContactIds: async (params: {
    searchQuery?: string;
    syncFilter: "ALL" | "UNSYNCED" | "SYNCED";
    linkFilter: "ALL" | "LINKED" | "UNLINKED";
    tagFilter: "ALL" | "REGULAR" | "BUSINESS" | "NONE";
    customerPhonesStr: string;
  }): Promise<string[]> => {
    const db = await getDb();
    const { searchQuery = "", syncFilter, linkFilter, tagFilter, customerPhonesStr } = params;

    let query = "SELECT id FROM local_contacts WHERE 1=1";
    const sqlParams: any[] = [];

    if (searchQuery.trim()) {
      const pattern = `%${searchQuery.trim()}%`;
      query += " AND (name LIKE ? OR phone LIKE ?)";
      sqlParams.push(pattern, pattern);
    }

    if (syncFilter === "UNSYNCED") {
      query += " AND syncState != 'SYNCED'";
    } else if (syncFilter === "SYNCED") {
      query += " AND syncState = 'SYNCED'";
    }

    if (tagFilter !== "ALL") {
      query += " AND tag = ?";
      sqlParams.push(tagFilter);
    }

    if (linkFilter === "LINKED") {
      query += " AND (customerId IS NOT NULL OR (length(?) > 0 AND instr(?, ',' || substr(phone, -10) || ',') > 0))";
      sqlParams.push(customerPhonesStr, customerPhonesStr);
    } else if (linkFilter === "UNLINKED") {
      query += " AND customerId IS NULL AND (length(?) = 0 OR instr(?, ',' || substr(phone, -10) || ',') = 0)";
      sqlParams.push(customerPhonesStr, customerPhonesStr);
    }

    query += " ORDER BY name ASC";
    const rows = await db.getAllAsync<{ id: string }>(query, sqlParams);
    return rows.map((r) => r.id);
  },

  /**
   * Gets total count of contacts matching active filters.
   */
  getFilteredContactsCount: async (params: {
    searchQuery?: string;
    syncFilter: "ALL" | "UNSYNCED" | "SYNCED";
    linkFilter: "ALL" | "LINKED" | "UNLINKED";
    tagFilter: "ALL" | "REGULAR" | "BUSINESS" | "NONE";
    customerPhonesStr: string;
  }): Promise<number> => {
    const db = await getDb();
    const { searchQuery = "", syncFilter, linkFilter, tagFilter, customerPhonesStr } = params;

    let query = "SELECT COUNT(*) as count FROM local_contacts WHERE 1=1";
    const sqlParams: any[] = [];

    if (searchQuery.trim()) {
      const pattern = `%${searchQuery.trim()}%`;
      query += " AND (name LIKE ? OR phone LIKE ?)";
      sqlParams.push(pattern, pattern);
    }

    if (syncFilter === "UNSYNCED") {
      query += " AND syncState != 'SYNCED'";
    } else if (syncFilter === "SYNCED") {
      query += " AND syncState = 'SYNCED'";
    }

    if (tagFilter !== "ALL") {
      query += " AND tag = ?";
      sqlParams.push(tagFilter);
    }

    if (linkFilter === "LINKED") {
      query += " AND (customerId IS NOT NULL OR (length(?) > 0 AND instr(?, ',' || substr(phone, -10) || ',') > 0))";
      sqlParams.push(customerPhonesStr, customerPhonesStr);
    } else if (linkFilter === "UNLINKED") {
      query += " AND customerId IS NULL AND (length(?) = 0 OR instr(?, ',' || substr(phone, -10) || ',') = 0)";
      sqlParams.push(customerPhonesStr, customerPhonesStr);
    }

    const row = await db.getFirstAsync<{ count: number }>(query, sqlParams);
    return row?.count || 0;
  },

  /**
   * Fetches statistics counts in one SQLite query.
   */
  getContactStats: async (customerPhonesStr = ""): Promise<{ total: number; unsynced: number; linked: number; unlinked: number; regular: number; business: number }> => {
    const db = await getDb();
    const row = await db.getFirstAsync<{ total: number; unsynced: number; linked: number; regular: number; business: number }>(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN syncState != 'SYNCED' THEN 1 ELSE 0 END) as unsynced,
        SUM(CASE WHEN customerId IS NOT NULL OR (length(?) > 0 AND instr(?, ',' || substr(phone, -10) || ',') > 0) THEN 1 ELSE 0 END) as linked,
        SUM(CASE WHEN tag = 'REGULAR' THEN 1 ELSE 0 END) as regular,
        SUM(CASE WHEN tag = 'BUSINESS' THEN 1 ELSE 0 END) as business
       FROM local_contacts`,
      [customerPhonesStr, customerPhonesStr]
    );

    const total = row?.total || 0;
    const unsynced = row?.unsynced || 0;
    const linked = row?.linked || 0;
    const unlinked = total - linked;
    const regular = row?.regular || 0;
    const business = row?.business || 0;

    return { total, unsynced, linked, unlinked, regular, business };
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
      const statement = await db.prepareAsync(
        "UPDATE local_contacts SET syncState = 'SYNCED' WHERE id = ?"
      );
      try {
        for (const id of ids) {
          await statement.executeAsync([id]);
        }
      } finally {
        await statement.finalizeAsync();
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
