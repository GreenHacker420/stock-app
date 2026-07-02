import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { queryKeys } from "./query-keys";
import {
  fetchAttendance,
  checkIn,
  checkOut,
  requestLeave,
  respondToLeave,
} from "../api/client";

export function useAttendanceQuery(filters: { shopId?: string; staffId?: string; dateFrom?: string; dateTo?: string } = {}) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: queryKeys.attendance(filters),
    queryFn: () => fetchAttendance(token ?? "", filters),
    enabled: Boolean(token),
  });
}

export function useCheckInMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shopId, note, staffId }: { shopId: string; note?: string; staffId?: string }) =>
      checkIn(token ?? "", shopId, note, staffId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
}

export function useCheckOutMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shopId, note, staffId }: { shopId: string; note?: string; staffId?: string }) =>
      checkOut(token ?? "", shopId, note, staffId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
}

export function useLeaveMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { startDate: string; endDate: string; reason: string }) =>
      requestLeave(token ?? "", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
}

export function useRespondToLeaveMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ leaveId, status }: { leaveId: string; status: "APPROVED" | "REJECTED" }) =>
      respondToLeave(token ?? "", leaveId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
}
