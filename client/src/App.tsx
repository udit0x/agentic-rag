import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UploadProvider } from "@/contexts/upload-context";
import { PersistentUploadProgress } from "@/components/upload/persistent-upload-progress";
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
