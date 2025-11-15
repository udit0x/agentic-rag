import { Upload, Settings, Library, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { QuotaBadge } from "@/components/chat/quota-badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DocumentUpload } from "@/components/upload/document-upload";
import { DocumentLibrary } from "@/components/upload/document-library";
import { useUploadContext } from "@/contexts/upload-context";
import { useIsMobile } from "@/hooks/use-mobile";
import Lottie from "lottie-react";
import settingsAnimation from "@/assets/animations/settings.json";
import { useState } from "react";
import LogoIcon from "@/assets/logo.svg?react";

interface Document {
  id: string;
  filename: string;
  size: number;
  uploadedAt: string;
}

interface HeaderProps {
  onSettingsClick?: () => void;
  onMenuClick?: () => void;
  documents?: Document[];
  onRefreshDocuments?: () => void;
  onDeleteDocument?: (documentId: string) => void;
}

export function Header({ 
  onSettingsClick,
  onMenuClick,
  documents = [], 
  onRefreshDocuments, 
  onDeleteDocument 
}: HeaderProps) {
  const isMobile = useIsMobile();
  const { hasActiveUploads, setUploadScreenOpen } = useUploadContext();
  const [isSettingsHovered, setIsSettingsHovered] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          {/* Mobile menu button */}
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onMenuClick}
              className="h-10 w-10"
              data-testid="button-mobile-menu"
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          )}
          
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary text-primary-foreground">
            <LogoIcon className="h-full w-full scale-150" />
          </div>
          {/* Hide text on mobile to save space, show only on desktop */}
          {!isMobile && (
            <div>
              <h1 className="text-xl font-bold tracking-tight" data-testid="text-app-title">
                <span className="text-primary">Mind</span>
                <span className="text-foreground">Mesh</span>
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Multi-Agent Document Intelligence
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Quota Badge - Show only on desktop, hidden on mobile */}
          {!isMobile && <QuotaBadge />}
          
          <Sheet onOpenChange={(open) => setUploadScreenOpen(open)}>
            <SheetTrigger asChild>
              <Button variant="outline" size="default" data-testid="button-upload" className="relative">
                <Upload className="h-4 w-4 mr-2" />
                Upload
                {hasActiveUploads && (
                  <div className="absolute -top-1 -right-1 h-3 w-3 bg-primary rounded-full animate-pulse">
                    <div className="absolute inset-0 bg-primary rounded-full animate-ping" />
                  </div>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Upload Documents</SheetTitle>
              </SheetHeader>
              <div className="mt-6">
                <DocumentUpload />
              </div>
            </SheetContent>
          </Sheet>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="default" data-testid="button-library" className="relative">
                <Library className="h-4 w-4 mr-2" />
                Library
                {documents.length > 0 && (
                  <span className="absolute -top-2 -right-2 h-5 w-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center">
                    {documents.length}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-2xl">
              <SheetHeader>
                <SheetTitle>Document Library</SheetTitle>
              </SheetHeader>
              <div className="mt-6">
                <DocumentLibrary 
                  documents={documents}
                  onRefresh={onRefreshDocuments || (() => {})}
                  onDeleteDocument={onDeleteDocument}
                />
              </div>
            </SheetContent>
          </Sheet>

          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onSettingsClick}
            data-testid="button-settings"
            onMouseEnter={() => setIsSettingsHovered(true)}
            onMouseLeave={() => setIsSettingsHovered(false)}
          >
            <div className="[&_svg_path]:stroke-foreground [&_svg_path]:fill-none">
              <Lottie
                animationData={settingsAnimation}
                loop={isSettingsHovered}
                autoplay={isSettingsHovered}
                style={{ width: 20, height: 20 }}
                rendererSettings={{
                  preserveAspectRatio: 'xMidYMid meet',
                }}
              />
            </div>
            <span className="sr-only">Settings</span>
          </Button>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
