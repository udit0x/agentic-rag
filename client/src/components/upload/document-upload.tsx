import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, File, X, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface UploadedFile {
  id: string;
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  error?: string;
}

interface DocumentUploadProps {
  onUpload: (file: File) => Promise<void>;
  accept?: string;
  maxSize?: number;
}

export function DocumentUpload({
  onUpload,
  accept = ".pdf,.txt",
  maxSize = 10 * 1024 * 1024, // 10MB
}: DocumentUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const validateFile = (file: File): string | null => {
    const extension = "." + file.name.split(".").pop()?.toLowerCase();
    const acceptedExtensions = accept.split(",").map((ext) => ext.trim().toLowerCase());

    if (!acceptedExtensions.includes(extension)) {
      return `File type ${extension} not supported. Please upload ${accept} files.`;
    }

    if (file.size > maxSize) {
      return `File size exceeds ${Math.round(maxSize / 1024 / 1024)}MB limit.`;
    }

    return null;
  };

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;

      const newFiles: UploadedFile[] = Array.from(fileList).map((file) => ({
        id: Math.random().toString(36).substring(7),
        file,
        status: "pending" as const,
        progress: 0,
      }));

      setFiles((prev) => [...prev, ...newFiles]);

      for (const uploadedFile of newFiles) {
        const error = validateFile(uploadedFile.file);

        if (error) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === uploadedFile.id ? { ...f, status: "error", error } : f
            )
          );
          toast({
            title: "Upload failed",
            description: error,
            variant: "destructive",
          });
          continue;
        }

        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadedFile.id ? { ...f, status: "uploading" } : f
          )
        );

        try {
          await onUpload(uploadedFile.file);
          setFiles((prev) =>
            prev.map((f) =>
              f.id === uploadedFile.id ? { ...f, status: "success", progress: 100 } : f
            )
          );
          toast({
            title: "Upload successful",
            description: `${uploadedFile.file.name} has been processed.`,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to upload file";
          setFiles((prev) =>
            prev.map((f) =>
              f.id === uploadedFile.id
                ? { ...f, status: "error", error: errorMessage }
                : f
            )
          );
          toast({
            title: "Upload failed",
            description: errorMessage,
            variant: "destructive",
          });
        }
      }
    },
    [onUpload, toast, accept, maxSize]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-colors min-h-48 flex flex-col items-center justify-center",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
        )}
        data-testid="upload-dropzone"
      >
        <Upload className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Upload documents
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Drag and drop files here, or click to browse
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          Supported formats: PDF, TXT (max {Math.round(maxSize / 1024 / 1024)}MB)
        </p>
        <Button
          onClick={() => fileInputRef.current?.click()}
          variant="outline"
          data-testid="button-browse-files"
        >
          Browse files
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={accept}
          onChange={handleFileInput}
          className="hidden"
          data-testid="input-file"
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((uploadedFile) => (
            <Card
              key={uploadedFile.id}
              className="p-3"
              data-testid={`card-file-${uploadedFile.status}`}
            >
              <div className="flex items-center gap-3">
                <File className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-medium truncate" data-testid="text-filename">
                      {uploadedFile.file.name}
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {(uploadedFile.file.size / 1024).toFixed(1)} KB
                      </span>
                      {uploadedFile.status === "success" && (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                      {uploadedFile.status === "error" && (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeFile(uploadedFile.id)}
                        data-testid="button-remove-file"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {uploadedFile.status === "uploading" && (
                    <Progress value={uploadedFile.progress} className="h-1" />
                  )}
                  {uploadedFile.status === "error" && uploadedFile.error && (
                    <p className="text-xs text-destructive mt-1">
                      {uploadedFile.error}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
