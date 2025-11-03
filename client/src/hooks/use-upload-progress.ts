import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

interface UploadProgress {
  id: string;
  fileName: string;
  fileSize: number;
  status: "uploading" | "processing" | "completed" | "error";
  currentStep: "upload" | "chunk" | "embed" | "save";
  progress: number;
  error?: string;
}

interface UseUploadProgressReturn {
  uploads: UploadProgress[];
  startUpload: (file: File) => Promise<void>;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
}

export function useUploadProgress(): UseUploadProgressReturn {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const { toast } = useToast();

  const updateUpload = useCallback((id: string, updates: Partial<UploadProgress>) => {
    setUploads(prev => prev.map(upload => 
      upload.id === id ? { ...upload, ...updates } : upload
    ));
  }, []);

  const simulateProgress = useCallback((id: string, step: UploadProgress["currentStep"], duration: number) => {
    return new Promise<void>((resolve) => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 15 + 5; // Random progress between 5-20%
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          resolve();
        }
        updateUpload(id, { currentStep: step, progress });
      }, duration / 10);
    });
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
      progress: 0,
    };

    setUploads(prev => [...prev, newUpload]);

    try {
      // Step 1: Upload file (simulate progress)
      updateUpload(uploadId, { currentStep: "upload", progress: 0 });
      await simulateProgress(uploadId, "upload", 1000);

      // Step 2: Start actual upload and processing
      updateUpload(uploadId, { 
        status: "processing", 
        currentStep: "chunk", 
        progress: 0 
      });

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

      // Simulate chunking progress
      await simulateProgress(uploadId, "chunk", 1500);

      // Step 3: Embedding generation
      updateUpload(uploadId, { currentStep: "embed", progress: 0 });
      await simulateProgress(uploadId, "embed", 2000);

      // Step 4: Save to database
      updateUpload(uploadId, { currentStep: "save", progress: 0 });

      // Make the actual API call
      const response = await apiRequest<{
        documentId: string;
        filename: string;
        chunksCreated: number;
      }>("/api/documents/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: contentType,
          content: content,
        }),
      });

      // Complete the save step
      await simulateProgress(uploadId, "save", 800);

      // Mark as completed
      updateUpload(uploadId, { 
        status: "completed", 
        progress: 100 
      });

      toast({
        title: "Upload successful",
        description: `${response.filename} processed with ${response.chunksCreated} chunks. Ready for querying!`,
      });

      // Refresh documents list in React Query cache
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });

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
  }, [updateUpload, simulateProgress, toast]);

  const removeUpload = useCallback((id: string) => {
    setUploads(prev => prev.filter(upload => upload.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(upload => upload.status !== "completed"));
  }, []);

  return {
    uploads,
    startUpload,
    removeUpload,
    clearCompleted,
  };
}