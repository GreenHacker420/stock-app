import { useInfiniteQuery, useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  getCustomerLedger,
  getCustomerLedgerSummary,
  getCustomerLedgerStatement,
  postOpeningBalance,
  postLedgerAdjustment,
  reverseLedgerEntry,
  LedgerQueryParams,
} from "../api/ledger.api";
import { invalidateAssetCache } from "./useAssetCache";

async function refreshCustomerLedger(queryClient: QueryClient, customerId: string, shopId: string) {
  invalidateAssetCache(shopId);
  await Promise.all([
    queryClient.refetchQueries({ queryKey: ["customer-ledger", customerId] }),
    queryClient.refetchQueries({ queryKey: ["customer-ledger-summary", customerId] }),
    queryClient.invalidateQueries({ queryKey: ["customer", customerId] }),
    queryClient.invalidateQueries({ queryKey: ["customer-outstanding", customerId] }),
    queryClient.invalidateQueries({ queryKey: ["customers"] }),
    queryClient.invalidateQueries({ queryKey: ["storage-objects"] }),
  ]);
}

export function useCustomerLedger(customerId: string, params: Omit<LedgerQueryParams, "cursor">) {
  return useInfiniteQuery({
    queryKey: ["customer-ledger", customerId, params],
    queryFn: ({ pageParam }) =>
      getCustomerLedger(customerId, {
        ...params,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: !!customerId && !!params.shopId,
  });
}

export function useCustomerLedgerSummary(customerId: string, shopId: string, from?: string, to?: string) {
  return useQuery({
    queryKey: ["customer-ledger-summary", customerId, shopId, from, to],
    queryFn: () => getCustomerLedgerSummary(customerId, { shopId, from, to }),
    enabled: !!customerId && !!shopId,
  });
}

export function useCustomerLedgerStatement(customerId: string, shopId: string, from: string, to: string) {
  return useQuery({
    queryKey: ["customer-ledger-statement", customerId, shopId, from, to],
    queryFn: () => getCustomerLedgerStatement(customerId, { shopId, from, to }),
    enabled: !!customerId && !!shopId && !!from && !!to,
  });
}

export function useOpeningBalance(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      shopId: string;
      direction: "DEBIT" | "CREDIT";
      amount: number;
      effectiveAt?: string;
      notes?: string;
      clientMutationId?: string;
      attachmentAssetIds?: { assetId: string; purpose?: string; sortOrder?: number }[];
    }) => postOpeningBalance(customerId, payload),
    onSuccess: (_, payload) => refreshCustomerLedger(queryClient, customerId, payload.shopId),
  });
}

export function useLedgerAdjustment(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      shopId: string;
      direction: "DEBIT" | "CREDIT";
      amount: number;
      reason: string;
      effectiveAt?: string;
      clientMutationId?: string;
      attachmentAssetIds?: { assetId: string; purpose?: string; sortOrder?: number }[];
    }) => postLedgerAdjustment(customerId, payload),
    onSuccess: (_, payload) => refreshCustomerLedger(queryClient, customerId, payload.shopId),
  });
}

export function useReverseLedgerEntry(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, payload }: { entryId: string; payload: { shopId: string; reversalReason: string } }) =>
      reverseLedgerEntry(customerId, entryId, payload),
    onSuccess: (_, variables) => refreshCustomerLedger(queryClient, customerId, variables.payload.shopId),
  });
}
