import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUploadContext } from "@/contexts/upload-context";
import { UploadProcessingVisualizer } from "@/components/upload/upload-processing-visualizer";
import { useIsMobile } from "@/hooks/use-mobile";

export function PersistentUploadProgress() {
  const { uploads, removeUpload, clearCompleted, hasActiveUploads, isUploadScreenOpen } = useUploadContext();
  const [isExpanded, setIsExpanded] = useState(true);
  const [autoHideTimeouts, setAutoHideTimeouts] = useState<Map<string, NodeJS.Timeout>>(new Map());
  const isMobile = useIsMobile();
  
  // Auto-hide completed uploads after 3 seconds
  useEffect(() => {
    uploads.forEach(upload => {
      if (upload.status === "completed" && upload.completedAt && !autoHideTimeouts.has(upload.id)) {
        const timeout = setTimeout(() => {
          removeUpload(upload.id);
          setAutoHideTimeouts(prev => {
            const newMap = new Map(prev);
            newMap.delete(upload.id);
            return newMap;
          });
        }, 3000);
        
        setAutoHideTimeouts(prev => new Map(prev).set(upload.id, timeout));
      }
    });

    // Cleanup timeouts for uploads that no longer exist
    autoHideTimeouts.forEach((timeout, uploadId) => {
      if (!uploads.find(u => u.id === uploadId)) {
        clearTimeout(timeout);
        setAutoHideTimeouts(prev => {
          const newMap = new Map(prev);
          newMap.delete(uploadId);
          return newMap;
        });
      }
    });
  }, [uploads, removeUpload, autoHideTimeouts]);

  // Show persistent progress only when:
  // 1. Upload screen is closed AND there are uploads, OR
  // 2. There are completed uploads that haven't been auto-hidden yet
  // 3. NOT on mobile (mobile users should only see uploads in the upload screen)
  const shouldShow = !isMobile && (
    (!isUploadScreenOpen && uploads.length > 0) || 
    uploads.some(u => u.status === "completed" && u.completedAt)
  );
  
  if (!shouldShow) {
    return null;
  }

  const activeUploadsCount = uploads.filter(u => 
    u.status === "uploading" || u.status === "processing"
  ).length;
  
  const completedUploadsCount = uploads.filter(u => 
    u.status === "completed"
  ).length;

  const errorUploadsCount = uploads.filter(u => 
    u.status === "error"
  ).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]"
    >
      <Card className="shadow-lg border-border/50 backdrop-blur-sm bg-background/95">
        {/* Header */}
        <div 
          className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">
                Upload Progress
              </h3>
              <div className="flex items-center gap-1">
                {activeUploadsCount > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                    <span className="text-xs text-primary font-medium">
                      {activeUploadsCount} processing
                    </span>
                  </div>
                )}
                {completedUploadsCount > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span className="text-xs text-green-600 font-medium">
                      {completedUploadsCount} done (auto-hiding...)
                    </span>
                  </div>
                )}
                {errorUploadsCount > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-destructive rounded-full" />
                    <span className="text-xs text-destructive font-medium">
                      {errorUploadsCount} failed
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {completedUploadsCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  clearCompleted();
                }}
                className="text-xs h-7"
              >
                Clear completed
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Expandable Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="p-4 pt-0 max-h-96">
                <div className="max-h-80 overflow-y-auto">
                  <UploadProcessingVisualizer 
                    uploads={uploads}
                    onRemove={removeUpload}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}