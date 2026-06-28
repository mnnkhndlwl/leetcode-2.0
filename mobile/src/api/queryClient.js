import { QueryClient } from "@tanstack/react-query";

// Single shared client. In-memory cache only (no persister) — server data is
// re-fetched on cold start; auth lives in the persisted Zustand store instead.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // data is "fresh" for 5 min — no refetch while navigating
      gcTime: 1000 * 60 * 30, // drop unused cache 30 min after last use
      retry: (failureCount, error) => {
        // Don't retry client errors (401/403/404 etc) — only transient/server ones.
        const status = error?.response?.status;
        if (status >= 400 && status < 500) return false;
        return failureCount < 3;
      },
    },
  },
});
