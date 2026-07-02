import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { queryKeys } from "./query-keys";
import {
  fetchAttendance,
  checkIn,
  checkOut,
  requestLeave,
  respondToLeave,
} from "../api/client";

const ATTENDANCE_PAGE_SIZE = 50;

/** Infinite-scroll version — preferred for the attendance history screen */
export function useInfiniteAttendanceQuery(filters: {
  shopId?: string;
  staffId?: string;
  dateFrom?: string;
  dateTo?: string;
} = {}) {
  const token = useAuthStore((state) => state.token);
  return useInfiniteQuery({
    queryKey: ["attendance-infinite", filters],
    queryFn: ({ pageParam = 1 }) =>
      fetchAttendance(token ?? "", {
        ...filters,
        page: pageParam as number,
        limit: ATTENDANCE_PAGE_SIZE,
      }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === ATTENDANCE_PAGE_SIZE ? allPages.length + 1 : undefined,
    initialPageParam: 1,
    enabled: Boolean(token),
    staleTime: 2 * 60 * 1000,
  });
}

/** Simple one-shot query — kept for small date-ranged views */
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
