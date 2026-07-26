import { sqliteClient } from "../../../database/sqlite-client";

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

let schemaPromise: Promise<void> | null = null;

function initializeDatabase() {
  if (!schemaPromise) {
    schemaPromise = sqliteClient.write((database) =>
      database.exec(`
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
          CREATE INDEX IF NOT EXISTS idx_contacts_tag ON local_contacts (tag);
          CREATE INDEX IF NOT EXISTS idx_contacts_customer ON local_contacts (customerId);
        `),
    );
  }
  return schemaPromise;
}

export const contactsDb = {
  /**
   * Bulk upserts contacts read from device address book into local SQLite database.
   * Keeps existing user modifications (tag, customerId, syncState === 'MUTATED') unchanged.
   */
  upsertDeviceContacts: async (contacts: Array<{ id: string; name: string; phone: string; email?: string }>) => {
    await initializeDatabase();
    const now = Date.now();
    
    await sqliteClient.transaction(async (transaction) => {
      const statement = await transaction.prepare(`
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
          await statement.execute([c.id, c.name, c.phone, c.email || null, now]);
        }
      } finally {
        await statement.finalize();
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
    customerPhoneSuffixes?: string[];
  }): Promise<LocalContact[]> => {
    await initializeDatabase();
    const { searchQuery = "", limit, offset, syncFilter, linkFilter, tagFilter, customerPhoneSuffixes = [] } = params;

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
      if (customerPhoneSuffixes.length > 0) {
        const placeholders = customerPhoneSuffixes.map(() => "?").join(",");
        query += ` AND (customerId IS NOT NULL OR substr(phone, -10) IN (${placeholders}))`;
        sqlParams.push(...customerPhoneSuffixes);
      } else {
        query += " AND customerId IS NOT NULL";
      }
    } else if (linkFilter === "UNLINKED") {
      if (customerPhoneSuffixes.length > 0) {
        const placeholders = customerPhoneSuffixes.map(() => "?").join(",");
        query += ` AND customerId IS NULL AND substr(phone, -10) NOT IN (${placeholders})`;
        sqlParams.push(...customerPhoneSuffixes);
      } else {
        query += " AND customerId IS NULL";
      }
    }

    query += " ORDER BY name ASC LIMIT ? OFFSET ?";
    sqlParams.push(limit, offset);

    return sqliteClient.read((database) => database.all<LocalContact>(query, sqlParams));
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
    customerPhoneSuffixes?: string[];
  }): Promise<string[]> => {
    await initializeDatabase();
    const { searchQuery = "", syncFilter, linkFilter, tagFilter, customerPhoneSuffixes = [] } = params;

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
      if (customerPhoneSuffixes.length > 0) {
        const placeholders = customerPhoneSuffixes.map(() => "?").join(",");
        query += ` AND (customerId IS NOT NULL OR substr(phone, -10) IN (${placeholders}))`;
        sqlParams.push(...customerPhoneSuffixes);
      } else {
        query += " AND customerId IS NOT NULL";
      }
    } else if (linkFilter === "UNLINKED") {
      if (customerPhoneSuffixes.length > 0) {
        const placeholders = customerPhoneSuffixes.map(() => "?").join(",");
        query += ` AND customerId IS NULL AND substr(phone, -10) NOT IN (${placeholders})`;
        sqlParams.push(...customerPhoneSuffixes);
      } else {
        query += " AND customerId IS NULL";
      }
    }

    query += " ORDER BY name ASC";
    const rows = await sqliteClient.read((database) =>
      database.all<{ id: string }>(query, sqlParams),
    );
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
    customerPhoneSuffixes?: string[];
  }): Promise<number> => {
    await initializeDatabase();
    const { searchQuery = "", syncFilter, linkFilter, tagFilter, customerPhoneSuffixes = [] } = params;

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
      if (customerPhoneSuffixes.length > 0) {
        const placeholders = customerPhoneSuffixes.map(() => "?").join(",");
        query += ` AND (customerId IS NOT NULL OR substr(phone, -10) IN (${placeholders}))`;
        sqlParams.push(...customerPhoneSuffixes);
      } else {
        query += " AND customerId IS NOT NULL";
      }
    } else if (linkFilter === "UNLINKED") {
      if (customerPhoneSuffixes.length > 0) {
        const placeholders = customerPhoneSuffixes.map(() => "?").join(",");
        query += ` AND customerId IS NULL AND substr(phone, -10) NOT IN (${placeholders})`;
        sqlParams.push(...customerPhoneSuffixes);
      } else {
        query += " AND customerId IS NULL";
      }
    }

    const row = await sqliteClient.read((database) =>
      database.first<{ count: number }>(query, sqlParams),
    );
    return row?.count || 0;
  },

  /**
   * Fetches statistics counts in fast SQLite queries.
   */
  getContactStats: async (customerPhoneSuffixes: string[] = []): Promise<{ total: number; unsynced: number; linked: number; unlinked: number; regular: number; business: number }> => {
    await initializeDatabase();
    const row = await sqliteClient.read((database) => database.first<{
      total: number;
      unsynced: number;
      directLinked: number;
      regular: number;
      business: number;
    }>(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN syncState != 'SYNCED' THEN 1 ELSE 0 END) as unsynced,
        SUM(CASE WHEN customerId IS NOT NULL THEN 1 ELSE 0 END) as directLinked,
        SUM(CASE WHEN tag = 'REGULAR' THEN 1 ELSE 0 END) as regular,
        SUM(CASE WHEN tag = 'BUSINESS' THEN 1 ELSE 0 END) as business
       FROM local_contacts`
    ));

    const total = row?.total || 0;
    const unsynced = row?.unsynced || 0;
    const directLinked = row?.directLinked || 0;
    const regular = row?.regular || 0;
    const business = row?.business || 0;

    let matchedPhoneCount = 0;
    if (customerPhoneSuffixes.length > 0) {
      const uniqueSuffixes = Array.from(new Set(customerPhoneSuffixes));
      for (let i = 0; i < uniqueSuffixes.length; i += 500) {
        const chunk = uniqueSuffixes.slice(i, i + 500);
        const placeholders = chunk.map(() => "?").join(",");
        const matchRow = await sqliteClient.read((database) => database.first<{ count: number }>(
          `SELECT COUNT(*) as count FROM local_contacts WHERE customerId IS NULL AND substr(phone, -10) IN (${placeholders})`,
          chunk
        ));
        matchedPhoneCount += matchRow?.count || 0;
      }
    }

    const linked = directLinked + matchedPhoneCount;
    const unlinked = total - linked;

    return { total, unsynced, linked, unlinked, regular, business };
  },

  /**
   * Updates contact tag state.
   */
  updateTag: async (id: string, tag: "REGULAR" | "BUSINESS" | "NONE") => {
    await initializeDatabase();
    await sqliteClient.write((database) => database.run(
      "UPDATE local_contacts SET tag = ?, syncState = 'MUTATED', updatedAt = ? WHERE id = ?",
      [tag, Date.now(), id]
    ));
  },

  /**
   * Links contact to an existing customer manually.
   */
  linkCustomer: async (id: string, customerId: string | null) => {
    await initializeDatabase();
    await sqliteClient.write((database) => database.run(
      "UPDATE local_contacts SET customerId = ?, syncState = 'MUTATED', updatedAt = ? WHERE id = ?",
      [customerId, Date.now(), id]
    ));
  },

  getContactByPhone: async (phone: string): Promise<LocalContact | null> => {
    await initializeDatabase();
    return sqliteClient.read((database) =>
      database.first<LocalContact>(
        "SELECT * FROM local_contacts WHERE phone = ? LIMIT 1",
        [phone]
      ),
    );
  },

  /**
   * Fetches all mutated contacts that need to be synced to the backend.
   */
  getMutatedContacts: async (): Promise<LocalContact[]> => {
    await initializeDatabase();
    return sqliteClient.read((database) =>
      database.all<LocalContact>(
        "SELECT * FROM local_contacts WHERE syncState = 'MUTATED' OR syncState = 'UNSYNCED'",
      ),
    );
  },

  /**
   * Marks contacts as synced after successful API post.
   */
  markAsSynced: async (ids: string[]) => {
    await initializeDatabase();
    await sqliteClient.transaction(async (transaction) => {
      const statement = await transaction.prepare(
        "UPDATE local_contacts SET syncState = 'SYNCED' WHERE id = ?"
      );
      try {
        for (const id of ids) {
          await statement.execute([id]);
        }
      } finally {
        await statement.finalize();
      }
    });
  },
  
  /**
   * Resets local database
   */
  clearAll: async () => {
    await initializeDatabase();
    await sqliteClient.write((database) => database.run("DELETE FROM local_contacts"));
  }
};
