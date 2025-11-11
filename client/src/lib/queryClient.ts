import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...options,
  });

  await throwIfResNotOk(res);
  return await res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      // Removed global staleTime and refetchOnWindowFocus to allow per-query configuration
      // Each query can now set its own staleTime and refetch behavior
      retry: (failureCount, error) => {
        // Don't retry on 401/403 (auth errors)
        if (error instanceof Error) {
          const errorMessage = error.message.toLowerCase();
          if (errorMessage.includes('401') || errorMessage.includes('403')) {
            console.warn('[RETRY] Skipping retry for auth error:', errorMessage);
            return false;
          }
          // Don't retry on 404 errors
          if (errorMessage.includes('404')) {
            console.warn('[RETRY] Skipping retry for 404:', errorMessage);
            return false;
          }
        }
        // Retry up to 2 times for network errors with exponential backoff
        if (failureCount >= 2) {
          console.warn(`[RETRY] Max retries (${failureCount}) reached`);
          return false;
        }
        // console.log(`[RETRY] Attempt ${failureCount + 1} of 3`);
        return true;
      },
      retryDelay: (attemptIndex) => {
        const delay = Math.min(1000 * 2 ** attemptIndex, 30000);
        // console.log(`[RETRY] Waiting ${delay}ms before retry ${attemptIndex + 1}`);
        return delay; // Exponential backoff: 1s, 2s, 4s...
      },
    },
    mutations: {
      retry: false, // Don't retry mutations by default
    },
  },
});
