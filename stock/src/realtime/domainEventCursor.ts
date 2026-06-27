import { ensureLocalDbReady } from "../local/prisma";
import { mmkvStorage } from "../auth/mmkv-storage";

function cursorKey(shopId: string): string {
  return `domain_event_cursor:${shopId}`;
}


export async function getDomainEventCursor(shopId: string): Promise<string | null> {
  const key = cursorKey(shopId);
  const dbReady = await ensureLocalDbReady();
  if (dbReady.ok) {
    try {
      const row = await dbReady.prisma.syncMetadata.findUnique({ where: { key } });
      if (row?.value) return row.value;
    } catch {
      // Fall through to MMKV
    }
  }
  return mmkvStorage.getItem(key);
}


export async function setDomainEventCursor(shopId: string, cursor: string): Promise<void> {
  const key = cursorKey(shopId);
  // Always write MMKV first (synchronous, always works)
  mmkvStorage.setItem(key, cursor);

  const dbReady = await ensureLocalDbReady();
  if (dbReady.ok) {
    try {
      await dbReady.prisma.syncMetadata.upsert({
        where: { key },
        update: { value: cursor, updatedAt: new Date() },
        create: { key, value: cursor, updatedAt: new Date() },
      });
    } catch {
      // MMKV already has the value, ignore DB error
    }
  }
}


export async function clearDomainEventCursors(shopIds?: string[]): Promise<void> {
  const dbReady = await ensureLocalDbReady();

  if (shopIds && shopIds.length > 0) {
    // Clear only known shop cursors
    for (const shopId of shopIds) {
      const key = cursorKey(shopId);
      mmkvStorage.removeItem(key);
      if (dbReady.ok) {
        try {
          await dbReady.prisma.syncMetadata.deleteMany({ where: { key } });
        } catch {
          // Best effort
        }
      }
    }
  } else {
    // No shop list — clear all domain_event_cursor keys from MMKV
    if (dbReady.ok) {
      try {
        const rows = await dbReady.prisma.syncMetadata.findMany({
          where: { key: { startsWith: "domain_event_cursor:" } },
        });
        for (const row of rows) {
          mmkvStorage.removeItem(row.key);
          await dbReady.prisma.syncMetadata.delete({ where: { key: row.key } }).catch(() => {});
        }
      } catch {
        // Best effort
      }
    }
  }
}
