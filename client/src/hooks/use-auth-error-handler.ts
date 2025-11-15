import { useEffect, useState } from "react";

/**
 * Hook to detect and handle authentication errors globally
 * Shows a popup when 401 Unauthorized is detected
 */
export function useAuthErrorHandler() {
  const [showUnauthorizedPopup, setShowUnauthorizedPopup] = useState(false);

  useEffect(() => {
    // Global fetch interceptor to catch 401 errors
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        
        // Check for 401 Unauthorized
        if (response.status === 401) {
          console.error("[AUTH_ERROR] 401 Unauthorized detected:", args[0]);
          setShowUnauthorizedPopup(true);
        }
        
        return response;
      } catch (error) {
        throw error;
      }
    };

    // Cleanup - restore original fetch
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const dismissPopup = () => {
    setShowUnauthorizedPopup(false);
  };

  const reloadPage = () => {
    window.location.reload();
  };

  return {
    showUnauthorizedPopup,
    dismissPopup,
    reloadPage,
  };
}
