import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, File, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useUploadContext } from "@/contexts/upload-context";
import { UploadProcessingVisualizer } from "./upload-processing-visualizer";
import { 
  UPLOAD_CONFIG, 
  getSupportedExtensions, 
  getFileTypeInfo, 
  formatSizeLimit 
} from "@/lib/file-types";

interface DropFile {
  id: string;
  file: File;
  error?: string;
}

interface DocumentUploadProps {
  accept?: string;
  maxSize?: number;
}

export function DocumentUpload({
  accept = getSupportedExtensions(),
  maxSize = UPLOAD_CONFIG.maxFileSize,
}: DocumentUploadProps) {
  const [dropFiles, setDropFiles] = useState<DropFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { uploads, startUpload, removeUpload, clearCompleted, hasActiveUploads } = useUploadContext();

  const validateFile = (file: File): string | null => {
    const extension = "." + file.name.split(".").pop()?.toLowerCase();
    const acceptedExtensions = accept.split(",").map((ext) => ext.trim().toLowerCase());

    if (!acceptedExtensions.includes(extension)) {
      const fileTypeInfo = getFileTypeInfo(extension);
      const supportedTypes = acceptedExtensions.join(", ");
      return `File type ${extension} not supported. ${
        fileTypeInfo 
          ? `Supported types: ${supportedTypes}` 
          : `Please upload one of: ${supportedTypes}`
      }`;
    }

    if (file.size > maxSize) {
      return `File size exceeds ${formatSizeLimit(maxSize)} limit.`;
    }

    return null;
  };

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;

      const validFiles: DropFile[] = [];
      const invalidFiles: DropFile[] = [];

      Array.from(fileList).forEach((file) => {
        const error = validateFile(file);
        const dropFile: DropFile = {
          id: Math.random().toString(36).substring(7),
          file,
          error: error || undefined,
        };

        if (error) {
          invalidFiles.push(dropFile);
        } else {
          validFiles.push(dropFile);
        }
      });

      // Add all files to drop files for display
      setDropFiles((prev) => [...prev, ...validFiles, ...invalidFiles]);

      // Show errors for invalid files
      invalidFiles.forEach((dropFile) => {
        toast({
          title: "Upload failed",
          description: dropFile.error,
          variant: "destructive",
        });
      });

      // Start upload for valid files
      validFiles.forEach((dropFile) => {
        startUpload(dropFile.file);
      });
    },
    [toast, accept, maxSize, startUpload]
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

  const removeDropFile = (id: string) => {
    setDropFiles((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className="space-y-6">
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
          {hasActiveUploads && (
            <span className="ml-2 inline-flex items-center gap-1 text-sm text-primary">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              Processing...
            </span>
          )}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Drag and drop documents here, or click to browse
        </p>
        <p className="text-xs text-muted-foreground mb-2">
          Supported: PDF, Word, PowerPoint, TXT (max {formatSizeLimit(maxSize)})
        </p>
        <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">
          <strong>Beta:</strong> Excel, CSV, JSON
        </p>
        <div className="text-xs text-amber-600 dark:text-amber-400 mb-4 max-w-md">
          ⏱ <strong>Processing time:</strong> Excel/CSV files and multiple uploads may take 1-2 minutes to process completely
        </div>
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

      {/* Upload Progress Visualization - Show on upload screen */}
      {uploads.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">
              Processing {uploads.length} document{uploads.length !== 1 ? 's' : ''}
            </h4>
            {uploads.some((u) => u.status === "completed") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCompleted}
                className="text-xs"
              >
                Clear completed
              </Button>
            )}
          </div>
          
          {/* Processing Time Reminder */}
          {hasActiveUploads && (
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded border">
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse flex-shrink-0" />
              <span>Processing documents... Large files may take 1-2 minutes</span>
            </div>
          )}
          
          <UploadProcessingVisualizer 
            uploads={uploads}
            onRemove={removeUpload}
          />
        </div>
      )}

      {/* Invalid Files Display */}
      {dropFiles.filter(f => f.error).length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-destructive">
            Files with errors:
          </h4>
          {dropFiles
            .filter(f => f.error)
            .map((dropFile) => (
              <Card key={dropFile.id} className="p-3 border-destructive/20">
                <div className="flex items-center gap-3">
                  <File className="h-5 w-5 text-destructive flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate text-destructive">
                        {dropFile.file.name}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeDropFile(dropFile.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-xs text-destructive mt-1">
                      {dropFile.error}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
