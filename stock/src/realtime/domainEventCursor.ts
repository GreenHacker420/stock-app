import { mmkvStorage } from "../auth/mmkv-storage";

function cursorKey(shopId: string): string {
  return `domain_event_cursor:${shopId}`;
}


export async function getDomainEventCursor(shopId: string): Promise<string | null> {
  return mmkvStorage.getItem(cursorKey(shopId));
}


export async function setDomainEventCursor(shopId: string, cursor: string): Promise<void> {
  mmkvStorage.setItem(cursorKey(shopId), cursor);
}


export async function clearDomainEventCursors(shopIds?: string[]): Promise<void> {
  if (shopIds && shopIds.length > 0) {
    for (const shopId of shopIds) {
      mmkvStorage.removeItem(cursorKey(shopId));
    }
  }
}
