import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { File, ArrowRight, Database, Zap, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface ProcessingStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: "pending" | "active" | "completed" | "error";
  progress?: number;
}

interface UploadProgress {
  id: string;
  fileName: string;
  fileSize: number;
  status: "uploading" | "processing" | "completed" | "error";
  currentStep: "upload" | "chunk" | "embed" | "save";
  progress: number;
  error?: string;
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
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [steps, setSteps] = useState<ProcessingStep[]>([
    {
      id: "upload",
      label: "Upload",
      icon: <File className="h-4 w-4" />,
      status: "active",
      progress: 0,
    },
    {
      id: "chunk",
      label: "Chunking",
      icon: <Zap className="h-4 w-4" />,
      status: "pending",
    },
    {
      id: "embed",
      label: "Embedding",
      icon: <Database className="h-4 w-4" />,
      status: "pending",
    },
    {
      id: "save",
      label: "Save",
      icon: <CheckCircle2 className="h-4 w-4" />,
      status: "pending",
    },
  ]);

  // Animate progress changes
  useEffect(() => {
    const targetProgress = upload.progress;
    const animate = () => {
      setAnimatedProgress(prev => {
        const diff = targetProgress - prev;
        if (Math.abs(diff) < 1) return targetProgress;
        return prev + diff * 0.1;
      });
    };
    
    const interval = setInterval(animate, 16);
    return () => clearInterval(interval);
  }, [upload.progress]);

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
          return { ...step, status: "active", progress: upload.progress };
        }

        const currentStepIndex = steps.findIndex(s => s.id === upload.currentStep);
        const stepIndex = steps.findIndex(s => s.id === step.id);
        
        if (stepIndex < currentStepIndex) {
          return { ...step, status: "completed" };
        }
        
        return { ...step, status: "pending" };
      });
    });
  }, [upload.currentStep, upload.status, upload.progress]);

  return (
    <Card className="p-4 space-y-4 w-full max-w-full overflow-hidden">
      {/* File Info Header */}
      <div className="flex items-center justify-between min-w-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex items-center justify-center h-10 w-10 rounded bg-primary/10 flex-shrink-0">
            <File className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{upload.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {(upload.fileSize / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          {upload.status === "completed" && (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          )}
          {upload.status === "error" && (
            <AlertCircle className="h-5 w-5 text-destructive" />
          )}
          {(upload.status === "uploading" || upload.status === "processing") && (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onRemove(upload.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Processing Steps */}
      <div className="space-y-3">
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
                  "flex items-center justify-center h-8 w-8 rounded-full border-2 transition-colors flex-shrink-0",
                  step.status === "completed" ? "bg-green-100 border-green-300 text-green-700" :
                  step.status === "active" ? "bg-primary/10 border-primary text-primary" :
                  step.status === "error" ? "bg-destructive/10 border-destructive text-destructive" :
                  "bg-muted border-muted-foreground/20 text-muted-foreground"
                )}
              >
                {step.status === "active" && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {step.status === "completed" && (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {step.status === "error" && (
                  <AlertCircle className="h-4 w-4" />
                )}
                {step.status === "pending" && step.icon}
              </motion.div>

              {/* Arrow between steps */}
              {index < steps.length - 1 && (
                <div className="flex-1 flex justify-center">
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Step Labels */}
        <div className="flex items-center justify-between w-full">
          {steps.map((step) => (
            <div key={`${step.id}-label`} className="flex-1 text-center">
              <p className={cn(
                "text-xs font-medium truncate",
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

      {/* Progress Bar for Active Step */}
      <AnimatePresence>
        {upload.status !== "completed" && upload.status !== "error" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {upload.currentStep === "upload" && "Uploading file..."}
                {upload.currentStep === "chunk" && "Splitting into chunks..."}
                {upload.currentStep === "embed" && "Generating embeddings..."}
                {upload.currentStep === "save" && "Saving to database..."}
              </span>
              <span>{Math.round(animatedProgress)}%</span>
            </div>
            <Progress value={animatedProgress} className="h-1" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Message */}
      <AnimatePresence>
        {upload.error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive"
          >
            {upload.error}
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
    <ScrollArea className="h-[400px] w-full">
      <div className="space-y-3">
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
    </ScrollArea>
  );
}