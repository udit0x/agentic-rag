import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider } from "@clerk/clerk-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UploadProvider } from "@/contexts/upload-context";
import { PersistentUploadProgress } from "@/components/upload/persistent-upload-progress";
import { AuthGate } from "@/components/auth/auth-gate";
import { useEffect } from "react";
import Chat from "@/pages/chat";
import NotFound from "@/pages/not-found";

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error("Missing Clerk Publishable Key");
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Chat />
      </Route>
      <Route>
        <NotFound />
      </Route>
    </Switch>
  );
}

function App() {
  // Initialize theme on app mount
  useEffect(() => {
    const initializeTheme = () => {
      const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
      const initialTheme = savedTheme || systemTheme;
      
      document.documentElement.classList.toggle("dark", initialTheme === "dark");
    };

    initializeTheme();
  }, []);

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <UploadProvider>
          <TooltipProvider>
            <AuthGate>
              <Toaster />
              <Router />
              <PersistentUploadProgress />
            </AuthGate>
          </TooltipProvider>
        </UploadProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
