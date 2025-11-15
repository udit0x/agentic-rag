import { useUser } from "@clerk/clerk-react";
import { useEffect, useState } from "react";

/**
 * User data synchronization
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

        // Sync user data
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
        
        // Connection error handling
        if (errorMessage.includes("fetch failed") || 
            errorMessage.includes("504") || 
            errorMessage.includes("502") ||
            errorMessage.includes("ECONNREFUSED")) {
          console.error("[USER_SYNC] Service unavailable - blocking access");
        }
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
