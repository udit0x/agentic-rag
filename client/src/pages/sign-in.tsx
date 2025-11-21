import { SignIn } from "@clerk/clerk-react";
import { motion } from "framer-motion";
import { dark } from "@clerk/themes";
import Aurora from "@/components/ui/Aurora";
import { Link } from "wouter";

export default function SignInPage() {
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
                baseTheme: dark,
                variables: {
                  colorPrimary: "hsl(217, 91%, 48%)",
                  colorBackground: "hsl(220, 13%, 10%)",
                  colorInputBackground: "hsl(222, 14%, 8%)",
                  colorInputText: "hsl(210, 20%, 92%)",
                  colorText: "hsl(210, 20%, 92%)",
                  colorTextSecondary: "hsl(217, 12%, 65%)",
                  colorNeutral: "hsl(210, 20%, 92%)",
                  colorDanger: "hsl(0, 84%, 42%)",
                  colorSuccess: "hsl(173, 58%, 39%)",
                  colorWarning: "hsl(43, 74%, 49%)",
                  fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                  borderRadius: "0.5rem",
                },
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
                  footerActionText: "text-muted-foreground",
                  footer: "text-center",
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
                },
                layout: {
                  socialButtonsPlacement: "top",
                  socialButtonsVariant: "blockButton",
                },
              }}
              path="/sign-in"
              routing="path"
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
