import { sqliteClient } from "../../../database/sqlite-client";
import { contactsDb, type LocalContact } from "./contactsDb";

const CHUNK_SIZE = 350;

async function ensureContactsDb() {
  await contactsDb.getFilteredContactsCount({
    searchQuery: "",
    syncFilter: "ALL",
    linkFilter: "ALL",
    tagFilter: "ALL",
    customerPhoneSuffixes: [],
  });
}

/**
 * Reads only the locally-selected rows from SQLite. This is used at the final
 * broadcast review step so the full phonebook never needs to be loaded into JS
 * or sent to the server.
 */
export async function getLocalContactsByIds(ids: string[]): Promise<LocalContact[]> {
  if (ids.length === 0) return [];
  await ensureContactsDb();

  const uniqueIds = [...new Set(ids)];
  const contacts: LocalContact[] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(offset, offset + CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = await sqliteClient.read((database) =>
      database.all<LocalContact>(
        `SELECT * FROM local_contacts WHERE id IN (${placeholders})`,
        chunk,
      ),
    );
    contacts.push(...rows);
  }

  const order = new Map(uniqueIds.map((id, index) => [id, index]));
  return contacts.sort((left, right) =>
    (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}
