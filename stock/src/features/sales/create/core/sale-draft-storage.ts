import { mmkvStorage } from "@/auth/mmkv-storage";
import type { SaleDraft, SaleMode } from "./sale.types";

const DRAFT_VERSION = 2;
const MAX_DRAFT_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_LOCAL_DRAFTS_PER_MODE = 25;

export type RegularSaleDraftViewState = {
  kind: "REGULAR";
  currentStep: 1 | 2 | 3;
  paymentType: "CASH" | "UPI" | "BANK_TRANSFER" | "CREDIT";
  partialPaymentMode: "CASH" | "UPI";
  amountPaid: string;
};

export type WalkInSaleDraftViewState = {
  kind: "WALK_IN";
  paymentMode: "CASH" | "UPI";
  amountReceived: string;
};

export type SaleDraftViewState = RegularSaleDraftViewState | WalkInSaleDraftViewState;

export type StoredSaleDraft = {
  version: typeof DRAFT_VERSION;
  id: string;
  userId: string;
  shopId: string;
  mode: SaleMode;
  createdAt: string;
  savedAt: string;
  draft: SaleDraft;
  view: SaleDraftViewState;
};

type LegacyStoredSaleDraft = Omit<StoredSaleDraft, "version" | "id" | "createdAt"> & {
  version: 1;
};

type SaveLocalSaleDraftInput = {
  id: string;
  userId: string;
  shopId: string;
  mode: SaleMode;
  draft: SaleDraft;
  view: SaleDraftViewState;
};

const collectionKey = (userId: string, shopId: string, mode: SaleMode) =>
  `sale-drafts:v${DRAFT_VERSION}:${userId}:${shopId}:${mode}`;

const legacyStorageKey = (userId: string, shopId: string, mode: SaleMode) =>
  `sale-draft:v1:${userId}:${shopId}:${mode}`;

export function createLocalSaleDraftId() {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function hasMeaningfulSaleDraft(draft: SaleDraft) {
  return Object.keys(draft.lines).length > 0
    || draft.customer.kind !== "ANONYMOUS"
    || draft.notes.trim().length > 0
    || draft.gstRequired;
}

function isValidDraft(value: unknown, shopId: string, mode: SaleMode): value is SaleDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<SaleDraft>;
  if (draft.shopId !== shopId || draft.mode !== mode || !draft.lines || typeof draft.lines !== "object") {
    return false;
  }
  if (typeof draft.saleDate !== "string" || typeof draft.paymentDate !== "string") return false;
  if (!draft.customer || typeof draft.customer !== "object") return false;

  return Object.values(draft.lines).every((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const line = candidate as SaleDraft["lines"][string];
    return Boolean(
      line.item
      && typeof line.item.id === "string"
      && typeof line.item.name === "string"
      && Number.isFinite(line.quantity)
      && line.quantity > 0
      && Number.isFinite(line.rateMinor)
      && Array.isArray(line.serialNumbers),
    );
  });
}

function isValidView(value: unknown, mode: SaleMode): value is SaleDraftViewState {
  if (!value || typeof value !== "object") return false;
  const view = value as Partial<SaleDraftViewState>;
  if (view.kind !== mode) return false;
  if (mode === "WALK_IN") {
    const walkIn = view as Partial<WalkInSaleDraftViewState>;
    return (walkIn.paymentMode === "CASH" || walkIn.paymentMode === "UPI")
      && typeof walkIn.amountReceived === "string";
  }
  const regular = view as Partial<RegularSaleDraftViewState>;
  return (regular.currentStep === 1 || regular.currentStep === 2 || regular.currentStep === 3)
    && ["CASH", "UPI", "BANK_TRANSFER", "CREDIT"].includes(regular.paymentType ?? "")
    && (regular.partialPaymentMode === "CASH" || regular.partialPaymentMode === "UPI")
    && typeof regular.amountPaid === "string";
}

function sanitizeDraft(stored: StoredSaleDraft): StoredSaleDraft {
  return {
    ...stored,
    draft: {
      ...stored.draft,
      // A customer signature is sensitive and becomes stale when another draft is resumed.
      creditAuthorization: null,
    },
  };
}

function isValidStoredDraft(
  stored: unknown,
  userId: string,
  shopId: string,
  mode: SaleMode,
  now: number,
): stored is StoredSaleDraft {
  if (!stored || typeof stored !== "object") return false;
  const candidate = stored as Partial<StoredSaleDraft>;
  const savedAt = Date.parse(candidate.savedAt ?? "");
  const createdAt = Date.parse(candidate.createdAt ?? "");
  return candidate.version === DRAFT_VERSION
    && typeof candidate.id === "string"
    && candidate.id.length > 0
    && candidate.userId === userId
    && candidate.shopId === shopId
    && candidate.mode === mode
    && Number.isFinite(savedAt)
    && Number.isFinite(createdAt)
    && now - savedAt <= MAX_DRAFT_AGE_MS
    && isValidDraft(candidate.draft, shopId, mode)
    && isValidView(candidate.view, mode);
}

function readCollection(
  userId: string,
  shopId: string,
  mode: SaleMode,
  now = Date.now(),
): StoredSaleDraft[] {
  const key = collectionKey(userId, shopId, mode);
  let candidates: unknown[] = [];
  try {
    const raw = mmkvStorage.getItem(key);
    if (typeof raw === "string" && raw) {
      const parsed = JSON.parse(raw);
      candidates = Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    candidates = [];
  }

  const drafts = candidates
    .filter((candidate): candidate is StoredSaleDraft =>
      isValidStoredDraft(candidate, userId, shopId, mode, now))
    .map(sanitizeDraft);

  // One-time migration from the original single-slot draft.
  try {
    const legacyKey = legacyStorageKey(userId, shopId, mode);
    const rawLegacy = mmkvStorage.getItem(legacyKey);
    if (typeof rawLegacy === "string" && rawLegacy) {
      const legacy = JSON.parse(rawLegacy) as LegacyStoredSaleDraft;
      const savedAt = Date.parse(legacy.savedAt);
      if (
        legacy.version === 1
        && legacy.userId === userId
        && legacy.shopId === shopId
        && legacy.mode === mode
        && Number.isFinite(savedAt)
        && now - savedAt <= MAX_DRAFT_AGE_MS
        && isValidDraft(legacy.draft, shopId, mode)
        && isValidView(legacy.view, mode)
      ) {
        drafts.push(sanitizeDraft({
          ...legacy,
          version: DRAFT_VERSION,
          id: createLocalSaleDraftId(),
          createdAt: legacy.savedAt,
        }));
      }
    }
    mmkvStorage.removeItem(legacyKey);
  } catch {
    // A corrupt legacy cache is safe to discard.
  }

  const unique = Array.from(new Map(drafts.map((draft) => [draft.id, draft])).values())
    .sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt))
    .slice(0, MAX_LOCAL_DRAFTS_PER_MODE);

  try {
    if (unique.length > 0) mmkvStorage.setItem(key, JSON.stringify(unique));
    else mmkvStorage.removeItem(key);
  } catch {
    // A local cache failure must never block checkout.
  }
  return unique;
}

function writeCollection(
  userId: string,
  shopId: string,
  mode: SaleMode,
  drafts: StoredSaleDraft[],
) {
  const key = collectionKey(userId, shopId, mode);
  try {
    if (drafts.length > 0) mmkvStorage.setItem(key, JSON.stringify(drafts));
    else mmkvStorage.removeItem(key);
  } catch {
    // A local cache failure must never block checkout.
  }
}

export function listLocalSaleDrafts(
  userId: string,
  shopId: string,
  mode?: SaleMode,
): StoredSaleDraft[] {
  const modes: SaleMode[] = mode ? [mode] : ["REGULAR", "WALK_IN"];
  return modes
    .flatMap((candidateMode) => readCollection(userId, shopId, candidateMode))
    .sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt));
}

export function loadLocalSaleDraft(
  userId: string,
  shopId: string,
  mode: SaleMode,
  id: string,
): StoredSaleDraft | null {
  return readCollection(userId, shopId, mode).find((draft) => draft.id === id) ?? null;
}

export function saveLocalSaleDraft({
  id,
  userId,
  shopId,
  mode,
  draft,
  view,
}: SaveLocalSaleDraftInput) {
  if (draft.shopId !== shopId || draft.mode !== mode || view.kind !== mode) return;
  if (!hasMeaningfulSaleDraft(draft)) {
    clearLocalSaleDraft(userId, shopId, mode, id);
    return;
  }

  const existing = readCollection(userId, shopId, mode);
  const previous = existing.find((candidate) => candidate.id === id);
  const now = new Date().toISOString();
  const stored: StoredSaleDraft = {
    version: DRAFT_VERSION,
    id,
    userId,
    shopId,
    mode,
    createdAt: previous?.createdAt ?? now,
    savedAt: now,
    draft: {
      ...draft,
      creditAuthorization: null,
    },
    view,
  };
  writeCollection(
    userId,
    shopId,
    mode,
    [stored, ...existing.filter((candidate) => candidate.id !== id)]
      .slice(0, MAX_LOCAL_DRAFTS_PER_MODE),
  );
}

export function clearLocalSaleDraft(
  userId: string,
  shopId: string,
  mode: SaleMode,
  id: string,
) {
  const remaining = readCollection(userId, shopId, mode)
    .filter((draft) => draft.id !== id);
  writeCollection(userId, shopId, mode, remaining);
}
