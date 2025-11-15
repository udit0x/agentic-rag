import { motion } from "framer-motion";
import { Dialog, DialogPortal, DialogOverlay, DialogTitle } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface AppHelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
  isFirstTime?: boolean;
  onGetStarted?: () => void;
}

// Animated background paths component from background-paths.tsx
function FloatingPaths({ position, isActive }: { position: number; isActive: boolean }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg
        className="w-full h-full text-slate-950 dark:text-white"
        viewBox="0 0 696 316"
        fill="none"
      >
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.1 + path.id * 0.03}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={isActive ? {
              pathLength: 1,
              opacity: [0.3, 0.6, 0.3],
              pathOffset: [0, 1, 0],
            } : {
              pathLength: 0.3,
              opacity: 0.6,
              pathOffset: 0,
            }}
            transition={{
              duration: 20 + Math.random() * 10,
              repeat: isActive ? Number.POSITIVE_INFINITY : 0,
              ease: "linear",
            }}
          />
        ))}
      </svg>
    </div>
  );
}

export function AppHelpDialog({ isOpen, onClose, isFirstTime = false, onGetStarted }: AppHelpDialogProps) {
  const isMobile = useIsMobile();

  const handleGetStarted = () => {
    onClose();
    if (onGetStarted) {
      onGetStarted();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogPortal>
        <DialogOverlay className="bg-black/80 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]",
            "max-w-5xl p-0 gap-0 overflow-hidden border-0 bg-white dark:bg-neutral-950 rounded-2xl",
            isMobile ? "w-[95vw] max-h-[90vh]" : "w-[85vw] max-h-[80vh]"
          )}
          onEscapeKeyDown={onClose}
          onPointerDownOutside={onClose}
        >
          <div className="relative w-full h-full flex flex-col overflow-hidden bg-white dark:bg-neutral-950">
            {/* Animated Background - Using both positions like original */}
            <div className="absolute inset-0 opacity-40">
              <FloatingPaths position={1} isActive={isOpen} />
              <FloatingPaths position={-1} isActive={isOpen} />
            </div>

            {/* Content */}
            <div className="relative z-10 flex flex-col h-full">
              {/* Header */}
              <div className="px-8 pt-8 pb-6 text-center">
                <DialogTitle className={cn(
                  "font-bold tracking-tight mb-2",
                  isMobile ? "text-2xl" : "text-3xl"
                )}>
                  {isFirstTime ? "Welcome to AI Orchestrator" : "How It Works"}
                </DialogTitle>
                <p className="text-muted-foreground text-xs md:text-sm max-w-xl mx-auto">
                  {isFirstTime 
                    ? "Your intelligent document analysis platform" 
                    : "AI-powered document intelligence system"
                  }
                </p>
              </div>

              {/* Three Sections with VERTICAL Dividers */}
              <div className={cn(
                "flex-1 overflow-y-auto px-6 pb-6",
                isMobile ? "flex flex-col gap-6" : "flex items-stretch gap-0"
              )}>
                {/* Section 1: Upload */}
                <div className="flex-1 px-4 py-2">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-primary font-semibold text-sm">1</span>
                    </div>
                    <h2 className="text-base font-semibold">Build Your Knowledge Base</h2>
                  </div>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Upload PDF, Word, PPT, and text files. The system automatically extracts content and indexes it for intelligent searching.
                  </p>
                </div>

                {/* Vertical Divider */}
                {!isMobile && <div className="w-px bg-border" />}

                {/* Section 2: AI Processing */}
                <div className="flex-1 px-4 py-2">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-primary font-semibold text-sm">2</span>
                    </div>
                    <h2 className="text-base font-semibold">AI Processing</h2>
                  </div>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Multiple specialized AI agents analyze your documents. Router, Retriever, and Reasoning agents work together to understand context.
                  </p>
                </div>

                {/* Vertical Divider */}
                {!isMobile && <div className="w-px bg-border" />}

                {/* Section 3: Query */}
                <div className="flex-1 px-4 py-2">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-primary font-semibold text-sm">3</span>
                    </div>
                    <h2 className="text-base font-semibold">Get Insights</h2>
                  </div>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Ask questions in natural language. Receive intelligent responses with citations showing exactly where information came from.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-border px-6 py-4 flex items-center justify-between bg-background/50 backdrop-blur-sm">
                <p className="text-xs text-muted-foreground">
                  {isFirstTime ? "Ready to get started?" : "Start uploading your documents"}
                </p>
                <Button
                  onClick={handleGetStarted}
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  Get Started
                </Button>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
