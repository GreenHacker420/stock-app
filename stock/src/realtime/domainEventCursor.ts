import { getDomainReadCache } from "../auth/domain-cache";
import {
  getStoredSequenceCursor,
  removeStoredSequenceCursor,
  setStoredSequenceCursor,
} from "../local/read-model/read-model-cache-core";

export async function getDomainEventCursor(userId: string, shopId: string): Promise<string | null> {
  try {
    return getStoredSequenceCursor(getDomainReadCache().storage, userId, shopId);
  } catch {
    return null;
  }
}


export async function setDomainEventCursor(userId: string, shopId: string, cursor: string | null): Promise<void> {
  try {
    setStoredSequenceCursor(getDomainReadCache().storage, userId, shopId, cursor);
  } catch {
    // Cursor writes require the encrypted domain cache. If it is unavailable,
    // the next bootstrap/reconciliation pass will recover from the snapshot.
  }
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
