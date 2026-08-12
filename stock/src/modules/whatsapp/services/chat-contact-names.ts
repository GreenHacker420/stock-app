import { sqliteClient } from "../../../database/sqlite-client";
import { extractPhoneSuffix } from "../../../utils/items/validation";
import { contactsDb, type LocalContact } from "./contactsDb";

const SQLITE_BIND_CHUNK = 400;
const memoryNames = new Map<string, string>();

function suffixFor(phone: string) {
  return extractPhoneSuffix(phone) || phone.replace(/\D/g, "");
}

export function getFastChatContactNames(phones: string[]) {
  const names: Record<string, string> = {};
  for (const phone of phones) {
    const suffix = suffixFor(phone);
    if (!suffix) continue;
    const cached = memoryNames.get(suffix) || contactsDb.getFastContactByPhone(phone)?.name?.trim();
    if (cached) {
      memoryNames.set(suffix, cached);
      names[suffix] = cached;
    }
  }
  return names;
}

export async function loadChatContactNames(phones: string[]) {
  const uniquePhones = [...new Set(phones.filter(Boolean))];
  const names = getFastChatContactNames(uniquePhones);
  const unresolvedSuffixes = [...new Set(
    uniquePhones
      .map(suffixFor)
      .filter((suffix) => suffix.length === 10 && !names[suffix]),
  )];

  if (unresolvedSuffixes.length === 0) return names;

  // Ensure the local contact schema has been initialized without issuing one query per chat.
  await contactsDb.getContacts({
    searchQuery: "",
    limit: 1,
    offset: 0,
    syncFilter: "ALL",
    linkFilter: "ALL",
    tagFilter: "ALL",
  });

  for (let start = 0; start < unresolvedSuffixes.length; start += SQLITE_BIND_CHUNK) {
    const chunk = unresolvedSuffixes.slice(start, start + SQLITE_BIND_CHUNK);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = await sqliteClient.read((database) => database.all<LocalContact>(
      `SELECT *
       FROM local_contacts
       WHERE substr(phone, -10) IN (${placeholders})
       ORDER BY updatedAt DESC`,
      chunk,
    ));

    for (const contact of rows) {
      const suffix = suffixFor(contact.phone);
      const name = contact.name?.trim();
      if (!suffix || !name || names[suffix]) continue;
      names[suffix] = name;
      memoryNames.set(suffix, name);
    }
  }

  return names;
}
