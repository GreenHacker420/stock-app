import { sqliteClient } from "../../../database/sqlite-client";
import type { LocalContact } from "./contactsDb";

const CHUNK_SIZE = 350;

/**
 * Reads only the locally-selected rows from SQLite. Non-empty IDs come from the
 * local_contacts query itself, so no separate initialization scan is needed.
 */
export async function getLocalContactsByIds(ids: string[]): Promise<LocalContact[]> {
  if (ids.length === 0) return [];

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

  const foundIds = new Set(contacts.map((contact) => contact.id));
  const missingCount = uniqueIds.reduce(
    (count, id) => count + (foundIds.has(id) ? 0 : 1),
    0,
  );
  if (missingCount > 0) {
    throw new Error(
      `${missingCount} selected contact${missingCount === 1 ? " is" : "s are"} no longer available. Refresh contacts and review the audience.`,
    );
  }

  const order = new Map(uniqueIds.map((id, index) => [id, index]));
  return contacts.sort((left, right) =>
    (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}
