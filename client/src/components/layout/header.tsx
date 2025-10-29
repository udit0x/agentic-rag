import { Upload, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DocumentUpload } from "@/components/upload/document-upload";

interface HeaderProps {
  onUpload: (file: File) => Promise<void>;
}

export function Header({ onUpload }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary text-primary-foreground">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground" data-testid="text-app-title">
              RAG Orchestrator
            </h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Multi-Agent Document Intelligence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="default" data-testid="button-upload">
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Upload Documents</SheetTitle>
              </SheetHeader>
              <div className="mt-6">
                <DocumentUpload onUpload={onUpload} />
              </div>
            </SheetContent>
          </Sheet>

          <Button variant="ghost" size="icon" data-testid="button-settings">
            <Settings className="h-5 w-5" />
            <span className="sr-only">Settings</span>
          </Button>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
