import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { queryKeys } from "./query-keys";
import {
  fetchCheques,
  fetchCheque,
  markChequeDeposited,
  markChequeCleared,
  markChequeBounced,
  markChequeReturned,
} from "../api/client";

export function useChequesQuery(options: { status?: string } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.cheques({ shopId: activeShopId ?? undefined, status: options.status }),
    queryFn: () => fetchCheques(token ?? "", { shopId: activeShopId ?? undefined, status: options.status }),
    enabled: !!token,
    staleTime: 3 * 60 * 1000, // 3 mins
  });
}

export function useChequeDetailQuery(id: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: queryKeys.cheque(id),
    queryFn: () => fetchCheque(token ?? "", id),
    enabled: !!token && !!id,
    staleTime: 3 * 60 * 1000, // 3 mins
  });
}

export function useMarkChequeDepositedMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      markChequeDeposited(token ?? "", id, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["cheques"] });
      queryClient.invalidateQueries({ queryKey: ["cheque", variables.id] });
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["payments", activeShopId] });
      }
    },
  });
}

export function useMarkChequeClearedMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      markChequeCleared(token ?? "", id, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["cheques"] });
      queryClient.invalidateQueries({ queryKey: ["cheque", variables.id] });
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["payments", activeShopId] });
      }
    },
  });
}

export function useMarkChequeBouncedMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      markChequeBounced(token ?? "", id, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["cheques"] });
      queryClient.invalidateQueries({ queryKey: ["cheque", variables.id] });
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["payments", activeShopId] });
      }
    },
  });
}

export function useMarkChequeReturnedMutation() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      markChequeReturned(token ?? "", id, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["cheques"] });
      queryClient.invalidateQueries({ queryKey: ["cheque", variables.id] });
      if (activeShopId) {
        queryClient.invalidateQueries({ queryKey: ["payments", activeShopId] });
      }
    },
  });
}
