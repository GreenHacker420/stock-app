import {
  Contact,
  ContactField,
  getPermissionsAsync,
  type PartialContactDetails,
} from "expo-contacts";
import { contactsDb } from "./contactsDb";
import { mmkvStorage } from "../../../auth/mmkv-storage";
import { extractDigits, extractPhoneSuffix } from "../../../utils/items/validation";

let isSyncing = false;
let lastSyncTimestamp = 0;
const SYNC_COOLDOWN_MS = 30_000;

export interface DeviceContactEntry {
  id: string;
  name: string;
  phone: string;
  email?: string;
}

const SYNCED_FIELDS = [
  ContactField.FULL_NAME,
  ContactField.GIVEN_NAME,
  ContactField.FAMILY_NAME,
  ContactField.PHONES,
  ContactField.EMAILS,
] as const;

type SyncedContactDetail = PartialContactDetails<typeof SYNCED_FIELDS>;

export function extractContactEntries(c: SyncedContactDetail): DeviceContactEntry[] {
  const firstName = c.givenName || "";
  const lastName = c.familyName || "";
  const nameField = c.fullName || "";
  const compoundName = [firstName, lastName].filter(Boolean).join(" ");
  const resolvedName = (nameField || compoundName || "").trim();

  if (!resolvedName) return [];

  const phones = c.phones || [];
  const entries: DeviceContactEntry[] = [];
  const seenSuffixes = new Set<string>();

  for (let idx = 0; idx < phones.length; idx++) {
    const rawNumber = phones[idx]?.number || "";
    const cleanPhone = extractDigits(rawNumber);
    const suffix = extractPhoneSuffix(cleanPhone);

    if (suffix && suffix.length >= 10 && !seenSuffixes.has(suffix)) {
      seenSuffixes.add(suffix);
      entries.push({
        id: `${c.id || resolvedName}_${idx}`,
        name: resolvedName,
        phone: cleanPhone,
        email: c.emails?.[0]?.address || undefined,
      });
    }
  }

  return entries;
}

export async function syncDeviceContactsToLocalDb(force = false): Promise<number> {
  const now = Date.now();
  if (isSyncing) return 0;
  if (!force && now - lastSyncTimestamp < SYNC_COOLDOWN_MS) return 0;

  try {
    const permission = await getPermissionsAsync();
    if (permission.status !== "granted") {
      return 0;
    }

    isSyncing = true;

    const data = await Contact.getAllDetails(SYNCED_FIELDS);

    if (!data || data.length === 0) {
      lastSyncTimestamp = now;
      return 0;
    }

    const allEntries: DeviceContactEntry[] = [];
    for (const item of data) {
      const extracted = extractContactEntries(item);
      for (const entry of extracted) {
        allEntries.push(entry);
      }
    }

    if (allEntries.length > 0) {
      await contactsDb.upsertDeviceContacts(allEntries);
      mmkvStorage.setItem("whatsapp_has_imported_device_contacts", "true");
      lastSyncTimestamp = Date.now();
    }

    return allEntries.length;
  } catch (error) {
    console.warn("[DeviceContactsSync] Background sync failed:", error);
    return 0;
  } finally {
    isSyncing = false;
  }
}
