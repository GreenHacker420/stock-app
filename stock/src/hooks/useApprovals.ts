import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { useShopStore } from "../auth/shop-store";
import { queryKeys } from "./query-keys";
import {
  fetchRateChangeRequests,
  approveRateChangeRequest,
  rejectRateChangeRequest,
  fetchCorrectionRequests,
  approveCorrectionRequest,
  rejectCorrectionRequest,
} from "../api/client";

export function useRateChangeRequestsQuery(options: { status?: string } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.rateChangeRequests({ shopId: activeShopId ?? undefined, status: options.status }),
    queryFn: () => fetchRateChangeRequests(token ?? "", { shopId: activeShopId ?? undefined, status: options.status }),
    enabled: !!token,
    staleTime: 2 * 60 * 1000, // 2 mins
  });
}

export function useApproveRateChangeRequestMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveRateChangeRequest(token ?? "", id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate-change-requests"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
    },
  });
}

export function useRejectRateChangeRequestMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      rejectRateChangeRequest(token ?? "", id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate-change-requests"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
    },
  });
}

export function useCorrectionRequestsQuery(options: { status?: string; entityType?: string } = {}) {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  return useQuery({
    queryKey: queryKeys.correctionRequests({ shopId: activeShopId ?? undefined, status: options.status, entityType: options.entityType }),
    queryFn: () => fetchCorrectionRequests(token ?? "", { shopId: activeShopId ?? undefined, status: options.status, entityType: options.entityType }),
    enabled: !!token,
    staleTime: 2 * 60 * 1000, // 2 mins
  });
}

export function useApproveCorrectionRequestMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveCorrectionRequest(token ?? "", id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["correction-requests"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
    },
  });
}

export function useRejectCorrectionRequestMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      rejectCorrectionRequest(token ?? "", id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["correction-requests"] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] });
    },
  });
}
