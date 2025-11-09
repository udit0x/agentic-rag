import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UploadProvider } from "@/contexts/upload-context";
import { PersistentUploadProgress } from "@/components/upload/persistent-upload-progress";
import { useEffect } from "react";
import Chat from "@/pages/chat";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Chat} />
      <Route component={NotFound} />
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
    <QueryClientProvider client={queryClient}>
      <UploadProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
          <PersistentUploadProgress />
        </TooltipProvider>
      </UploadProvider>
    </QueryClientProvider>
  );
}

export default App;
