import { SignIn, useUser } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserSync } from "@/hooks/use-user-sync";
import Aurora from "@/components/ui/Aurora";
import { OrbitalLoader } from "@/components/ui/orbital-loader";

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const { isSignedIn, isLoaded, user } = useUser();
  const { isSyncing, syncError } = useUserSync();
  const [showContent, setShowContent] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  useEffect(() => {
    if (isLoaded && !initialLoadComplete) {
      setInitialLoadComplete(true);
    }
  }, [isLoaded, initialLoadComplete]);

  useEffect(() => {
    if (isLoaded && isSignedIn && !isSyncing && initialLoadComplete) {
      // Small delay for smooth transition after user sync
      const timer = setTimeout(() => setShowContent(true), 300);
      return () => clearTimeout(timer);
    } else {
      setShowContent(false);
    }
  }, [isLoaded, isSignedIn, isSyncing, initialLoadComplete]);

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
        <div className="absolute inset-0 opacity-40">
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
                  Welcome to Agentic RAG
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
                    // Make form buttons more visible
                    formFieldAction: "text-primary hover:text-primary/80",
                    formFieldAction__password: "text-primary hover:text-primary/80",
                    // Ensure input text is white/foreground color
                    formFieldInputGroup: "bg-background text-foreground",
                    // Alternative button styles
                    alternativeMethodsBlockButton: "border-border bg-background hover:bg-accent text-foreground",
                    alternativeMethodsBlockButtonText: "text-foreground",
                    // Make sure all text inputs have proper contrast
                    formFieldRow: "text-foreground",
                    formFieldHintText: "text-muted-foreground",
                    formFieldSuccessText: "text-green-600 dark:text-green-400",
                    formFieldErrorText: "text-red-600 dark:text-red-400",
                    // CAPTCHA styling
                    identityPreview: "bg-background/50 border-border text-foreground",
                    identityPreviewEditButtonIcon: "text-primary",
                    footer: "hidden", // Hide footer to make it cleaner
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
              />
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-6 text-center text-xs text-muted-foreground"
            >
              By signing in, you agree to our Terms of Service and Privacy Policy
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
