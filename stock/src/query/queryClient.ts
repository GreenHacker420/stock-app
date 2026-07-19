import { QueryClient } from "@tanstack/react-query";

function shouldRetry(failureCount: number, error: unknown, maxRetries: number) {
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : null;

  if (status !== null && status >= 400 && status < 500) return false;
  return failureCount < maxRetries;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (failureCount, error) => shouldRetry(failureCount, error, 2),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    mutations: {
      retry: (failureCount, error) => shouldRetry(failureCount, error, 1),
    },
  },
});

export function clearRuntimeQueryState() {
  queryClient.clear();
}
