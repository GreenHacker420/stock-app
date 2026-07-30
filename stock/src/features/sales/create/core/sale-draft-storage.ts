import { mmkvStorage } from "@/auth/mmkv-storage";
import type { SaleDraft, SaleMode } from "./sale.types";

const DRAFT_VERSION = 1;
const MAX_DRAFT_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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
  userId: string;
  shopId: string;
  mode: SaleMode;
  savedAt: string;
  draft: SaleDraft;
  view: SaleDraftViewState;
};

const storageKey = (userId: string, shopId: string, mode: SaleMode) =>
  `sale-draft:v${DRAFT_VERSION}:${userId}:${shopId}:${mode}`;

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

export function loadLocalSaleDraft(
  userId: string,
  shopId: string,
  mode: SaleMode,
  now = Date.now(),
): StoredSaleDraft | null {
  const key = storageKey(userId, shopId, mode);
  try {
    const raw = mmkvStorage.getItem(key);
    if (typeof raw !== "string" || !raw) return null;
    const stored = JSON.parse(raw) as StoredSaleDraft;
    const savedAt = Date.parse(stored.savedAt);
    const valid = stored.version === DRAFT_VERSION
      && stored.userId === userId
      && stored.shopId === shopId
      && stored.mode === mode
      && Number.isFinite(savedAt)
      && now - savedAt <= MAX_DRAFT_AGE_MS
      && isValidDraft(stored.draft, shopId, mode)
      && isValidView(stored.view, mode);

    if (!valid) {
      clearLocalSaleDraft(userId, shopId, mode);
      return null;
    }

    return {
      ...stored,
      draft: {
        ...stored.draft,
        // A customer signature is sensitive and can become stale as the draft changes.
        creditAuthorization: null,
      },
    };
  } catch {
    clearLocalSaleDraft(userId, shopId, mode);
    return null;
  }
}

export function saveLocalSaleDraft({
  userId,
  shopId,
  mode,
  draft,
  view,
}: Omit<StoredSaleDraft, "version" | "savedAt">) {
  const key = storageKey(userId, shopId, mode);
  if (draft.shopId !== shopId || draft.mode !== mode || view.kind !== mode) return;
  if (!hasMeaningfulSaleDraft(draft)) {
    try {
      mmkvStorage.removeItem(key);
    } catch {
      // A local cache failure must never block the sale screen.
    }
    return;
  }

  const stored: StoredSaleDraft = {
    version: DRAFT_VERSION,
    userId,
    shopId,
    mode,
    savedAt: new Date().toISOString(),
    draft: {
      ...draft,
      creditAuthorization: null,
    },
    view,
  };
  try {
    mmkvStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // A local cache failure must never block the sale screen.
  }
}

export function clearLocalSaleDraft(userId: string, shopId: string, mode: SaleMode) {
  try {
    mmkvStorage.removeItem(storageKey(userId, shopId, mode));
  } catch {
    // Clearing a missing or unavailable local cache is safe to ignore.
  }
}
