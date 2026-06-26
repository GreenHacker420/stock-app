import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { queryKeys } from "./query-keys";
import { fetchMe, updateMe, fetchStaff, createStaff, updateStaff } from "../api/client";

export function useMeQuery() {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => fetchMe(token ?? ""),
    enabled: !!token,
    staleTime: 30 * 60 * 1000,
    refetchOnReconnect: false,
  });
}

export function useUpdateMeMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name?: string; email?: string | null; password?: string }) =>
      updateMe(token ?? "", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });
}

export function useSignInMutation() {
  const signIn = useAuthStore((state) => state.signIn);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ identifier, password }: { identifier: string; password: string }) =>
      signIn(identifier, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      queryClient.invalidateQueries({ queryKey: queryKeys.shops() });
    },
  });
}

export function useSignInWithSavedTokenMutation() {
  const signInWithSavedToken = useAuthStore((state) => state.signInWithSavedToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pin?: string) => signInWithSavedToken(pin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      queryClient.invalidateQueries({ queryKey: queryKeys.shops() });
    },
  });
}

export function useSignOutMutation() {
  const signOut = useAuthStore((state) => state.signOut);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => signOut(),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

export function useStaffQuery() {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: queryKeys.staff(),
    queryFn: () => fetchStaff(token ?? ""),
    enabled: !!token,
    staleTime: 15 * 60 * 1000, // 15 mins
  });
}

export function useCreateStaffMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => createStaff(token ?? "", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.staff() });
    },
  });
}

export function useUpdateStaffMutation() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      updateStaff(token ?? "", id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.staff() });
    },
  });
}
