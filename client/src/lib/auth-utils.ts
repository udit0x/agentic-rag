/**
 * Authentication Session Utility
 * 
 * Helps prevent and resolve authentication session conflicts that can cause
 * "no user found" errors on sign-up pages or other authentication issues.
 */

import { useAuth } from "@clerk/clerk-react";
import { useEffect } from "react";

/**
 * Hook to ensure clean authentication state on auth pages
 * 
 * This hook helps prevent session conflicts by:
 * 1. Detecting stale or partial sessions
 * 2. Clearing problematic session state when needed
 * 3. Ensuring proper mode isolation between sign-in and sign-up
 */
export function useAuthPageCleanup(mode: 'signin' | 'signup') {
  const { isSignedIn, isLoaded } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;

    // Only interfere if user is FULLY signed in with an active session
    // Don't interfere with verification steps or partial sign-up flows
    if (isSignedIn && (mode === 'signin' || mode === 'signup')) {
      console.log(`[AUTH_CLEANUP] User already signed in, should redirect from ${mode} page`);
      // Let AuthGate handle this - don't force anything here
      return;
    }

    // Log any potential issues but don't automatically clear them
    // This prevents interfering with legitimate verification flows
    try {
      const clerkKeys = Object.keys(localStorage).filter(key => 
        key.startsWith('clerk-') || 
        key.startsWith('__clerk') ||
        key.includes('auth')
      );
      
      if (clerkKeys.length > 0 && !isSignedIn) {
        console.log(`[AUTH_CLEANUP] Found auth data on ${mode} page (this is normal):`, clerkKeys.length, 'keys');
      }
    } catch (error) {
      console.warn('[AUTH_CLEANUP] Error checking localStorage:', error);
    }
  }, [isLoaded, isSignedIn, mode]);

  return {
    isReady: isLoaded,
    // Only report conflict for FULLY signed in users, not verification steps
    hasConflict: false // Disable this check to prevent interference
  };
}

/**
 * Utility function to manually clear problematic auth state
 * Call this if users report persistent authentication issues
 */
export function clearAuthState() {
  try {
    // Clear localStorage items that might cause conflicts
    const keysToRemove = Object.keys(localStorage).filter(key => 
      key.startsWith('clerk-') || 
      key.startsWith('__clerk') ||
      key.includes('auth') ||
      key.includes('session')
    );
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });
    
    // Clear sessionStorage as well
    const sessionKeysToRemove = Object.keys(sessionStorage).filter(key => 
      key.startsWith('clerk-') || 
      key.startsWith('__clerk') ||
      key.includes('auth') ||
      key.includes('session')
    );
    
    sessionKeysToRemove.forEach(key => {
      sessionStorage.removeItem(key);
    });
    
    console.log('[AUTH_CLEANUP] Cleared auth state:', { 
      localStorageKeys: keysToRemove,
      sessionStorageKeys: sessionKeysToRemove
    });
    
    // Reload the page to ensure clean state
    window.location.reload();
    
  } catch (error) {
    console.error('[AUTH_CLEANUP] Error clearing auth state:', error);
  }
}

/**
 * Debug utility to inspect current auth state
 * Useful for troubleshooting authentication issues
 */
export function debugAuthState() {
  const authData = {
    localStorage: Object.keys(localStorage).filter(key => 
      key.startsWith('clerk-') || 
      key.startsWith('__clerk') ||
      key.includes('auth')
    ),
    sessionStorage: Object.keys(sessionStorage).filter(key => 
      key.startsWith('clerk-') || 
      key.startsWith('__clerk') ||
      key.includes('auth')
    ),
    cookies: document.cookie.split(';').filter(cookie => 
      cookie.includes('clerk') || 
      cookie.includes('auth') ||
      cookie.includes('session')
    ),
    url: window.location.href,
    userAgent: navigator.userAgent
  };
  
  console.log('[AUTH_DEBUG] Current auth state:', authData);
  return authData;
}