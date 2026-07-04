import { getDomainReadCache } from "../auth/domain-cache";
import {
  getStoredSequenceCursor,
  removeStoredSequenceCursor,
  setStoredSequenceCursor,
} from "../local/read-model/read-model-cache-core";

export async function getDomainEventCursor(userId: string, shopId: string): Promise<string | null> {
  return getStoredSequenceCursor(getDomainReadCache().storage, userId, shopId);
}


export async function setDomainEventCursor(userId: string, shopId: string, cursor: string | null): Promise<void> {
  setStoredSequenceCursor(getDomainReadCache().storage, userId, shopId, cursor);
}


export async function clearDomainEventCursors(userId: string, shopIds?: string[]): Promise<void> {
  if (!shopIds || shopIds.length === 0) return;
  let storage;
  try {
    storage = getDomainReadCache().storage;
  } catch {
    return;
  }
  for (const shopId of shopIds) {
    removeStoredSequenceCursor(storage, userId, shopId);
  }
}
