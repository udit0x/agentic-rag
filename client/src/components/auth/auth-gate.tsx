import { SignIn, useUser } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserSync } from "@/hooks/use-user-sync";
import { useBackendHealth } from "@/hooks/use-backend-health";
import Aurora from "@/components/ui/Aurora";
import { OrbitalLoader } from "@/components/ui/orbital-loader";
import { Button } from "@/components/ui/button";
import { RefreshCw, ServerOff } from "lucide-react";
import { Link } from "wouter";

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const { isSignedIn, isLoaded, user } = useUser();
  const { isSyncing, syncError } = useUserSync();
  const { isHealthy, isChecking, error: healthError, retry } = useBackendHealth();
  const [showContent, setShowContent] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

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
      <div className="min-h-screen relative overflow-hidden bg-background">
        {/* Aurora background */}
        <div className="absolute inset-0 opacity-30 w-full h-full">
          <Aurora
            colorStops={['#7c3aed', '#06b6d4', '#8b5cf6']}
            amplitude={2.5}
            blend={0.7}
            speed={0.5}
          />
        </div>

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-background/60 via-background/40 to-background/60 backdrop-blur-sm" />

        {/* Content */}
        <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="max-w-md w-full"
          >
            <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-3xl p-10 shadow-2xl">
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

  // Show loading state while Clerk is initializing
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-4"
        >
          <OrbitalLoader message="Loading..." messagePlacement="bottom" />
        </motion.div>
      </div>
    );
  }

  // Show sign-in modal with blurred background if not authenticated
  if (!isSignedIn) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-background">
        {/* Aurora background */}
        <div className="absolute inset-0 opacity-40 w-full h-full">
          <Aurora
            colorStops={['#7c3aed', '#06b6d4', '#8b5cf6']}
            amplitude={2.5}
            blend={0.7}
            speed={0.5}
          />
        </div>

        {/* Gradient overlay for better contrast */}
        <div className="absolute inset-0 bg-gradient-to-br from-background/60 via-background/40 to-background/60 backdrop-blur-sm" />
          
        {/* Additional animated accent elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <motion.div
            className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-cyan-500/20 rounded-full blur-3xl"
            animate={{
              scale: [1.2, 1, 1.2],
              opacity: [0.3, 0.2, 0.3],
            }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </div>

        {/* Sign-in modal */}
        <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-full max-w-md"
          >
            <div className="mb-8 text-center">
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <h1 className="text-3xl font-bold text-foreground mb-2">
                  Welcome to MindMesh
                </h1>
                <p className="text-muted-foreground">
                  Sign in to access your document AI assistant
                </p>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="flex justify-center items-center"
            >
              <SignIn
                appearance={{
                  elements: {
                    rootBox: "w-full flex justify-center",
                    card: "w-full bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl",
                    headerTitle: "text-foreground",
                    headerSubtitle: "text-muted-foreground",
                    socialButtonsBlockButton: 
                      "border-border bg-background hover:bg-accent text-foreground",
                    socialButtonsBlockButtonText: "text-foreground font-medium",
                    formButtonPrimary: 
                      "bg-primary hover:bg-primary/90 text-primary-foreground",
                    footerActionLink: "text-primary hover:text-primary/80",
                    formFieldInput: 
                      "bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-primary",
                    formFieldLabel: "text-foreground font-medium",
                    formFieldInputShowPasswordButton: "text-muted-foreground hover:text-foreground",
                    identityPreviewText: "text-foreground",
                    identityPreviewEditButton: "text-primary hover:text-primary/80",
                    dividerLine: "bg-border",
                    dividerText: "text-muted-foreground",
                    otpCodeFieldInput: "bg-background border-border text-foreground",
                    formHeaderTitle: "text-foreground",
                    formHeaderSubtitle: "text-muted-foreground",
                    formFieldAction: "text-primary hover:text-primary/80",
                    formFieldAction__password: "text-primary hover:text-primary/80",
                    formFieldInputGroup: "bg-background text-foreground",
                    alternativeMethodsBlockButton: "border-border bg-background hover:bg-accent text-foreground",
                    alternativeMethodsBlockButtonText: "text-foreground",
                    formFieldRow: "text-foreground",
                    formFieldHintText: "text-muted-foreground",
                    formFieldSuccessText: "text-green-600 dark:text-green-400",
                    formFieldErrorText: "text-red-600 dark:text-red-400",
                    identityPreview: "bg-background/50 border-border text-foreground",
                    identityPreviewEditButtonIcon: "text-primary",
                    footer: "hidden",
                  },
                  layout: {
                    socialButtonsPlacement: "top",
                    socialButtonsVariant: "blockButton",
                  },
                }}
                routing="virtual"
                signUpUrl="/sign-up"
                forceRedirectUrl="/"
                fallbackRedirectUrl="/"
                afterSignInUrl="/"
                afterSignUpUrl="/"
              />
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-6 text-center text-xs text-muted-foreground"
            >
              By signing in, you agree to our{" "}
              <Link href="/terms-of-use">
                <span className="text-primary hover:underline cursor-pointer">
                  Terms of Use
                </span>
              </Link>
              {" "}and{" "}
              <Link href="/privacy-policy">
                <span className="text-primary hover:underline cursor-pointer">
                  Privacy Policy
                </span>
              </Link>
            </motion.p>
          </motion.div>
        </div>
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
