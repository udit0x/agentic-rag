import { useUser } from "@clerk/clerk-react";
import { useEffect, useState } from "react";

/**
 * Hook to sync Clerk user data with backend database
 * Automatically creates or updates user record when user signs in
 */
export function useUserSync() {
  const { user, isSignedIn, isLoaded } = useUser();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncAttempted, setSyncAttempted] = useState(false);

  useEffect(() => {
    async function syncUser() {
      // Prevent multiple sync attempts
      if (!isLoaded || !isSignedIn || !user || isSyncing || syncAttempted) {
        return;
      }

      try {
        setIsSyncing(true);
        setSyncError(null);
        setSyncAttempted(true);

        // Prepare user data for sync
        const userData = {
          id: user.id,
          email: user.primaryEmailAddress?.emailAddress || "",
          name: user.fullName || user.username || "Anonymous",
          picture: user.imageUrl,
          locale: user.unsafeMetadata?.locale as string | undefined,
          preferences: user.unsafeMetadata?.preferences as Record<string, any> | undefined,
        };

        // Call backend to sync user
        const response = await fetch("/api/users/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(userData),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to sync user: ${response.statusText}`);
        }

        const result = await response.json();
        // console.log("[USER_SYNC] User synced successfully:", result);
      } catch (error) {
        console.error("[USER_SYNC] Error syncing user:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to sync user";
        setSyncError(errorMessage);
        
        // If it's a connection error, it might be backend down
        if (errorMessage.includes("fetch failed") || 
            errorMessage.includes("504") || 
            errorMessage.includes("502") ||
            errorMessage.includes("ECONNREFUSED")) {
          console.error("[USER_SYNC] Backend appears to be down - blocking access");
          // The health check will handle blocking the user
        }
        // Don't block the user for other errors - they can still use the app
      } finally {
        setIsSyncing(false);
      }
    }

    syncUser();
  }, [isLoaded, isSignedIn, user?.id]); // Only depend on user ID changing

  return {
    isSyncing,
    syncError,
    userId: user?.id,
    userEmail: user?.primaryEmailAddress?.emailAddress,
  };
}

/**
 * Get the current authenticated user's ID
 * Returns null if not authenticated
 */
export function useAuthUserId(): string | null {
  const { user, isSignedIn } = useUser();
  return isSignedIn && user ? user.id : null;
}
