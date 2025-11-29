import { useUser } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserSync } from "@/hooks/use-user-sync";
import { useBackendHealth } from "@/hooks/use-backend-health";
import { OrbitalLoader } from "@/components/ui/orbital-loader";
import { Button } from "@/components/ui/button";
import { RefreshCw, ServerOff } from "lucide-react";
import { useLocation } from "wouter";

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const { isSignedIn, isLoaded } = useUser();
  const { isSyncing, syncError } = useUserSync();
  const { isHealthy, isChecking, error: healthError, retry } = useBackendHealth();
  const [showContent, setShowContent] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isLoaded && !initialLoadComplete) {
      setInitialLoadComplete(true);
    }
  }, [isLoaded, initialLoadComplete]);

  useEffect(() => {
    if (isLoaded && isSignedIn && !isSyncing && initialLoadComplete && isHealthy) {
      // Small delay for smooth transition after user sync
      const timer = setTimeout(() => setShowContent(true), 300);
      return () => clearTimeout(timer);
    } else {
      setShowContent(false);
    }
  }, [isLoaded, isSignedIn, isSyncing, initialLoadComplete, isHealthy]);

  // Redirect to sign-in page if not authenticated
  // BUT DO NOT redirect if user is already on an auth page (prevents OTP interruption)
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      // Don't redirect if user is on sign-in or sign-up pages (including sub-routes like OTP verification)
      if (location !== "/sign-in" && !location.startsWith("/sign-up")) {
        setLocation("/sign-in");
      }
    }
  }, [isLoaded, isSignedIn, location, setLocation]);

  // Show loading state while Clerk is initializing
  if (!isLoaded || !initialLoadComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-4"
        >
          <OrbitalLoader message="Initializing..." messagePlacement="bottom" />
        </motion.div>
      </div>
    );
  }

  // Show syncing state (only if it takes longer than expected)
  if (isSignedIn && isSyncing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-4"
        >
          <OrbitalLoader message="Setting up your account..." messagePlacement="bottom" />
        </motion.div>
      </div>
    );
  }

  // Show sync error if it occurs (but don't block - just warn)
  if (syncError) {
    console.warn("[AUTH_GATE] User sync error:", syncError);
    // Continue to show content even with sync error
  }

  // Block access if service is unavailable
  if (!isHealthy && !isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="max-w-md w-full"
        >
          <div className="bg-card border border-border rounded-3xl p-10 shadow-2xl">
            {/* Icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="flex justify-center mb-8"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-violet-500/20 blur-xl rounded-full" />
                <div className="relative bg-gradient-to-br from-violet-500/10 to-cyan-500/10 p-5 rounded-full">
                  <ServerOff className="w-10 h-10 text-muted-foreground" strokeWidth={1.5} />
                </div>
              </div>
            </motion.div>

            {/* Message */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-center mb-8"
            >
              <h2 className="text-2xl font-semibold text-foreground mb-3">
                Service Temporarily Unavailable
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                We're having trouble connecting to our services right now. Please try again in a moment.
              </p>
            </motion.div>

            {/* Retry Button */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <Button
                onClick={retry}
                className="w-full h-11"
                variant="default"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Show service health check in progress
  if (isChecking && !isHealthy) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-4"
        >
          <OrbitalLoader message="Connecting to services..." messagePlacement="bottom" />
        </motion.div>
      </div>
    );
  }

  // If not signed in, check if we're on an auth page before showing loading
  if (!isSignedIn) {
    // If user is on sign-up or sign-in pages, let those components render instead of showing loading
    if (location.startsWith("/sign-up") || location === "/sign-in") {
      // Return children directly for auth pages (let Clerk components handle the UI)
      return <>{children}</>;
    }
    
    // For other pages, show loading while redirecting
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-4"
        >
          <OrbitalLoader message="Redirecting..." messagePlacement="bottom" />
        </motion.div>
      </div>
    );
  }

  // Show authenticated content with fade-in animation
  return (
    <AnimatePresence mode="wait">
      {showContent && (
        <motion.div
          key="authenticated-content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
