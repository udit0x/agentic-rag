import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { File, ArrowRight, Database, Zap, CheckCircle2, AlertCircle, Loader2, X, Clock, FileWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";

interface ProcessingStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: "pending" | "active" | "completed" | "error";
}

interface UploadProgress {
  id: string;
  fileName: string;
  fileSize: number;
  status: "uploading" | "processing" | "completed" | "error";
  currentStep: "upload" | "chunk" | "embed" | "save";
  error?: string;
  completedAt?: number;
  warnings?: string[]; // Array of warning messages
}

interface UploadProcessingVisualizerProps {
  uploads: UploadProgress[];
  onRemove: (id: string) => void;
}

function SingleUploadVisualizer({
  upload,
  onRemove,
}: {
  upload: UploadProgress;
  onRemove: (id: string) => void;
}) {
  const isMobile = useIsMobile();
  const [steps, setSteps] = useState<ProcessingStep[]>([
    {
      id: "upload",
      label: "Upload",
      icon: <File className="h-3 w-3 sm:h-4 sm:w-4" />,
      status: "active",
    },
    {
      id: "chunk",
      label: "Chunking",
      icon: <Zap className="h-3 w-3 sm:h-4 sm:w-4" />,
      status: "pending",
    },
    {
      id: "embed",
      label: "Embedding",
      icon: <Database className="h-3 w-3 sm:h-4 sm:w-4" />,
      status: "pending",
    },
    {
      id: "save",
      label: "Save",
      icon: <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4" />,
      status: "pending",
    },
  ]);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [showLargeFileMessage, setShowLargeFileMessage] = useState(false);

  // Helper function to check if file has large content warning
  const hasLargeFileWarning = () => {
    return upload.warnings?.some(warning => 
      warning.toLowerCase().includes('large content warning') || 
      warning.toLowerCase().includes('large document') ||
      warning.toLowerCase().includes('hang on')
    ) || false;
  };

  // Delayed large file message display
  useEffect(() => {
    if (hasLargeFileWarning() && (upload.status === "uploading" || upload.status === "processing")) {
      const timer = setTimeout(() => {
        setShowLargeFileMessage(true);
      }, 3000); // 3 second delay for better sync
      
      return () => clearTimeout(timer);
    } else {
      setShowLargeFileMessage(false);
    }
  }, [upload.warnings, upload.status]);

  // Countdown timer for completed uploads
  useEffect(() => {
    if (upload.status === "completed" && upload.completedAt) {
      const startCountdown = () => {
        const elapsed = Date.now() - upload.completedAt!;
        const remaining = Math.max(0, 5000 - elapsed); // Increased to 5 seconds
        
        if (remaining > 0) {
          setCountdown(Math.ceil(remaining / 1000));
          const timer = setTimeout(() => {
            startCountdown();
          }, 100);
          return () => clearTimeout(timer);
        } else {
          setCountdown(null);
        }
      };
      
      startCountdown();
    } else {
      setCountdown(null);
    }
  }, [upload.status, upload.completedAt]);

  // Update steps based on current upload state
  useEffect(() => {
    setSteps(prevSteps => {
      return prevSteps.map(step => {
        if (upload.status === "error") {
          return {
            ...step,
            status: step.id === upload.currentStep ? "error" : 
                   steps.findIndex(s => s.id === step.id) < steps.findIndex(s => s.id === upload.currentStep) 
                   ? "completed" : "pending"
          };
        }

        if (upload.status === "completed") {
          return { ...step, status: "completed" };
        }

        if (step.id === upload.currentStep) {
          return { ...step, status: "active" };
        }

        const currentStepIndex = steps.findIndex(s => s.id === upload.currentStep);
        const stepIndex = steps.findIndex(s => s.id === step.id);
        
        if (stepIndex < currentStepIndex) {
          return { ...step, status: "completed" };
        }
        
        return { ...step, status: "pending" };
      });
    });
  }, [upload.currentStep, upload.status]);

  return (
    <Card className="p-3 sm:p-4 space-y-3 sm:space-y-4 w-full max-w-full overflow-visible relative">
      {/* File Info Header */}
      <div className="flex items-center justify-between min-w-0 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="flex items-center justify-center h-8 w-8 sm:h-10 sm:w-10 rounded bg-primary/10 flex-shrink-0">
            <File className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-xs sm:text-sm font-medium text-foreground truncate">{upload.fileName}</p>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              {(upload.fileSize / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {upload.status === "completed" && (
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
              {countdown && (
                <div className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs text-green-600">
                  <Clock className="h-3 w-3" />
                  <span>{countdown}s</span>
                </div>
              )}
            </div>
          )}
          {upload.status === "error" && (
            <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
          )}
          {(upload.status === "uploading" || upload.status === "processing") && (
            <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-primary" />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 sm:h-6 sm:w-6 touch-manipulation"
            onClick={() => onRemove(upload.id)}
          >
            <X className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
          </Button>
        </div>
      </div>

      {/* Processing Steps */}
      <div className="space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between w-full">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              {/* Step Icon */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0.5 }}
                animate={{ 
                  scale: step.status === "active" ? 1.1 : 1,
                  opacity: step.status === "pending" ? 0.5 : 1
                }}
                className={cn(
                  "flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-full border-2 transition-colors flex-shrink-0",
                  step.status === "completed" ? "bg-green-100 border-green-300 text-green-700" :
                  step.status === "active" ? "bg-primary/10 border-primary text-primary" :
                  step.status === "error" ? "bg-destructive/10 border-destructive text-destructive" :
                  "bg-muted border-muted-foreground/20 text-muted-foreground"
                )}
              >
                {step.status === "active" && (
                  <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                )}
                {step.status === "completed" && (
                  <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                )}
                {step.status === "error" && (
                  <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                )}
                {step.status === "pending" && step.icon}
              </motion.div>

              {/* Arrow between steps */}
              {index < steps.length - 1 && (
                <div className="flex-1 flex justify-center px-0.5 sm:px-1">
                  <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Step Labels - Hidden on very small mobile screens */}
        <div className={cn(
          "flex items-center justify-between w-full",
          isMobile && "hidden xs:flex"
        )}>
          {steps.map((step) => (
            <div key={`${step.id}-label`} className="flex-1 text-left">
              <p className={cn(
                "text-[10px] sm:text-xs font-medium truncate",
                step.status === "completed" ? "text-green-700" :
                step.status === "active" ? "text-primary" :
                step.status === "error" ? "text-destructive" :
                "text-muted-foreground"
              )}>
                {step.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {upload.error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="p-2 bg-destructive/10 border border-destructive/20 rounded text-[10px] sm:text-xs text-destructive break-words"
          >
            {upload.error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Integrated Large File Warning Slider */}
      <AnimatePresence>
        {showLargeFileMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ 
              opacity: 1, 
              height: "auto",
              marginTop: isMobile ? 12 : 16,
              transition: { 
                duration: 0.4,
                ease: "easeOut"
              }
            }}
            exit={{ 
              opacity: 0, 
              height: 0,
              marginTop: 0,
              transition: { 
                duration: 0.3,
                ease: "easeIn"
              }
            }}
            className="absolute left-0 right-0 -bottom-2 bg-card border border-border rounded-b-lg border-t-0 shadow-sm"
            style={{ 
              borderTopLeftRadius: 0, 
              borderTopRightRadius: 0,
              marginLeft: '0px',
              marginRight: '0px',
              transform: isMobile ? 'translateY(6px)' : 'translateY(8px)'
            }}
          >
            <div className="px-3 py-1.5 sm:px-4 sm:py-2 bg-muted/30">
              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                <FileWarning className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <span className="text-[10px] sm:text-xs font-medium text-muted-foreground whitespace-nowrap">
                  {isMobile ? "Large doc - Processing..." : "Large document - Hang on"}
                </span>
                <div className="flex items-center gap-1">
                  <div className="w-1 h-1 bg-muted-foreground rounded-full animate-pulse"></div>
                  <div className="w-1 h-1 bg-muted-foreground rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-1 h-1 bg-muted-foreground rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

export function UploadProcessingVisualizer({
  uploads,
  onRemove,
}: UploadProcessingVisualizerProps) {
  if (uploads.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 sm:space-y-3">
      <AnimatePresence>
        {uploads.map((upload) => (
          <motion.div
            key={upload.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            <SingleUploadVisualizer
              upload={upload}
              onRemove={onRemove}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}