import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest as enhancedApiRequest, API_ENDPOINTS } from "@/lib/api-config";
import { queryClient } from "@/lib/queryClient";
import { useCacheStore } from "@/stores/cache-store";

interface UploadProgress {
  id: string;
  fileName: string;
  fileSize: number;
  status: "uploading" | "processing" | "completed" | "error";
  currentStep: "upload" | "chunk" | "embed" | "save";
  error?: string;
  completedAt?: number; // Timestamp when upload completed
}

interface UploadContextType {
  uploads: UploadProgress[];
  startUpload: (file: File) => Promise<void>;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
  hasActiveUploads: boolean;
  isUploadScreenOpen: boolean;
  setUploadScreenOpen: (open: boolean) => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

interface UploadProviderProps {
  children: ReactNode;
}

export function UploadProvider({ children }: UploadProviderProps) {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isUploadScreenOpen, setIsUploadScreenOpen] = useState(false);
  const { toast } = useToast();
  const invalidateDocumentLibrary = useCacheStore((state) => state.invalidateDocumentLibrary);

  const updateUpload = useCallback((id: string, updates: Partial<UploadProgress>) => {
    setUploads(prev => prev.map(upload => 
      upload.id === id ? { ...upload, ...updates } : upload
    ));
  }, []);

  const updateStep = useCallback((id: string, step: UploadProgress["currentStep"]) => {
    updateUpload(id, { currentStep: step });
  }, [updateUpload]);

  const startUpload = useCallback(async (file: File) => {
    const uploadId = Math.random().toString(36).substring(7);
    
    // Initialize upload tracking
    const newUpload: UploadProgress = {
      id: uploadId,
      fileName: file.name,
      fileSize: file.size,
      status: "uploading",
      currentStep: "upload",
    };

    setUploads(prev => [...prev, newUpload]);

    try {
      // Step 1: Upload file (real file reading)
      updateStep(uploadId, "upload");

      // Read file content
      let content: string;
      let contentType = file.type;
      
      if (file.type === "text/plain" || file.name.endsWith(".txt")) {
        content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsText(file);
        });
        contentType = "text/plain";
      } else {
        content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result as string;
            const base64Content = base64.split(',')[1];
            resolve(base64Content);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      // Step 2: Send to backend for processing
      updateUpload(uploadId, { 
        status: "processing", 
        currentStep: "chunk"
      });

      // Start the API call and simulate the backend steps
      const apiPromise = enhancedApiRequest<{
        documentId: string;
        filename: string;
        chunksCreated: number;
      }>(API_ENDPOINTS.DOCUMENT_UPLOAD, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: contentType,
          content: content,
          // userId now validated server-side from JWT token
        }),
      });

      // Show step progression while API is processing with gradual timing
      setTimeout(() => updateStep(uploadId, "embed"), 1800);
      setTimeout(() => updateStep(uploadId, "save"), 3600);

      // Wait for the actual API call to complete
      const response = await apiPromise;

      // Mark as completed
      updateUpload(uploadId, { 
        status: "completed",
        currentStep: "save",
        completedAt: Date.now()
      });

      toast({
        title: "Upload successful",
        description: `${response.filename} processed with ${response.chunksCreated} chunks. Ready for querying!`,
      });

      // ✅ Invalidate BOTH React Query AND Zustand cache to ensure UI updates
      // Use partial key matching to invalidate all document queries regardless of userId
      queryClient.invalidateQueries({ queryKey: ["documents"], exact: false });
      invalidateDocumentLibrary(); // ✅ Clear Zustand cache for documents
      
      // ✅ Force an immediate refetch to update the UI
      await queryClient.refetchQueries({ queryKey: ["documents"], exact: false });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to upload file";
      
      updateUpload(uploadId, { 
        status: "error", 
        error: errorMessage 
      });

      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  }, [updateUpload, updateStep, toast]);

  const removeUpload = useCallback((id: string) => {
    setUploads(prev => prev.filter(upload => upload.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(upload => upload.status !== "completed"));
  }, []);

  // Check if there are any active uploads (not completed/error)
  const hasActiveUploads = uploads.some(upload => 
    upload.status === "uploading" || upload.status === "processing"
  );

  const value: UploadContextType = {
    uploads,
    startUpload,
    removeUpload,
    clearCompleted,
    hasActiveUploads,
    isUploadScreenOpen,
    setUploadScreenOpen: setIsUploadScreenOpen,
  };

  return (
    <UploadContext.Provider value={value}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUploadContext() {
  const context = useContext(UploadContext);
  if (context === undefined) {
    throw new Error("useUploadContext must be used within an UploadProvider");
  }
  return context;
}

// Backward compatibility hook that matches the old API
export function useUploadProgress() {
  return useUploadContext();
}