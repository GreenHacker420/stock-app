import { clampLineQuantity } from "./sale-calculations";
import { createSaleFingerprint } from "./sale-fingerprint";
import type { CreditAuthorization, ItemSnapshot, SaleCustomer, SaleDraft, SettlementDraft } from "./sale.types";

export type SaleDraftAction =
  | { type: "SET_CUSTOMER"; customer: SaleCustomer }
  | { type: "ADD_QUANTITY"; item: ItemSnapshot; delta: number }
  | { type: "SET_QUANTITY"; item: ItemSnapshot; quantity: number }
  | { type: "SET_RATE"; itemId: string; rateMinor: number }
  | { type: "SET_SERIALS"; itemId: string; serialNumbers: string[] }
  | { type: "SET_NOTES"; notes: string }
  | { type: "SET_GST"; required: boolean }
  | { type: "SET_SETTLEMENT"; settlement: SettlementDraft }
  | { type: "AUTHORIZE_CREDIT"; authorization: CreditAuthorization }
  | { type: "RESET_DRAFT"; shopId?: string };

export function createInitialSaleDraft(mode: SaleDraft["mode"], shopId: string): SaleDraft {
  return {
    mode,
    shopId,
    customer: mode === "REGULAR" ? { kind: "ANONYMOUS" } : { kind: "ANONYMOUS" },
    lines: {},
    notes: "",
    gstRequired: false,
    settlement: { kind: "UNSETTLED" },
    creditAuthorization: null,
  };
}

const invalidateAuthorization = (draft: SaleDraft): SaleDraft =>
  draft.creditAuthorization ? { ...draft, creditAuthorization: null } : draft;

function setQuantity(draft: SaleDraft, item: ItemSnapshot, requestedQuantity: number): SaleDraft {
  const quantity = clampLineQuantity(requestedQuantity, item.availableStock);
  const nextLines = { ...draft.lines };
  if (quantity === 0) {
    delete nextLines[item.id];
  } else {
    const current = draft.lines[item.id];
    nextLines[item.id] = {
      item,
      quantity,
      rateMinor: current?.rateMinor ?? item.defaultRateMinor,
      serialNumbers: (current?.serialNumbers ?? []).slice(0, quantity),
    };
  }
  return invalidateAuthorization({ ...draft, lines: nextLines });
}

export function saleDraftReducer(draft: SaleDraft, action: SaleDraftAction): SaleDraft {
  switch (action.type) {
    case "SET_CUSTOMER":
      return invalidateAuthorization({ ...draft, customer: action.customer });
    case "ADD_QUANTITY":
      return setQuantity(draft, action.item, (draft.lines[action.item.id]?.quantity ?? 0) + action.delta);
    case "SET_QUANTITY":
      return setQuantity(draft, action.item, action.quantity);
    case "SET_RATE": {
      const line = draft.lines[action.itemId];
      if (!line) return draft;
      return invalidateAuthorization({
        ...draft,
        lines: { ...draft.lines, [action.itemId]: { ...line, rateMinor: Math.max(0, Math.round(action.rateMinor)) } },
      });
    }
    case "SET_SERIALS": {
      const line = draft.lines[action.itemId];
      if (!line) return draft;
      return invalidateAuthorization({
        ...draft,
        lines: { ...draft.lines, [action.itemId]: { ...line, serialNumbers: action.serialNumbers.slice(0, line.quantity) } },
      });
    }
    case "SET_NOTES":
      return { ...draft, notes: action.notes };
    case "SET_GST":
      return invalidateAuthorization({ ...draft, gstRequired: action.required });
    case "SET_SETTLEMENT":
      return invalidateAuthorization({ ...draft, settlement: action.settlement });
    case "AUTHORIZE_CREDIT":
      return action.authorization.transactionFingerprint === createSaleFingerprint(draft)
        ? { ...draft, creditAuthorization: action.authorization }
        : draft;
    case "RESET_DRAFT":
      return createInitialSaleDraft(draft.mode, action.shopId ?? draft.shopId);
    default:
      return draft;
  }
}

