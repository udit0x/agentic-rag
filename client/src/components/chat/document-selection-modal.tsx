import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, 
  FileText, 
  X, 
  CheckSquare, 
  Square,
  Clock,
  FileIcon,
  Download,
  Filter,
  File,
  Sheet,
  Presentation,
  FileCode
} from "lucide-react";
import { 
  Dialog,
  DialogContent, 
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface Document {
  id: string;
  filename: string;
  size: number;
  uploadedAt: string;
}

interface DocumentSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: Document[];
  selectedDocumentIds: string[];
  onSelectionChange: (documentIds: string[]) => void;
  mode?: "single" | "multi";
  className?: string;
}

export function DocumentSelectionModal({
  isOpen,
  onClose,
  documents,
  selectedDocumentIds,
  onSelectionChange,
  mode = "multi",
  className
}: DocumentSelectionModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>(selectedDocumentIds);
  const [selectedFileTypes, setSelectedFileTypes] = useState<string[]>([]);
  const isMobile = useIsMobile();

  // Get file extension helper
  const getFileExtension = (filename: string): string => {
    return filename.split('.').pop()?.toUpperCase() || 'FILE';
  };

  // Get available file types from documents
  const availableFileTypes = useMemo(() => {
    const types = new Set<string>();
    documents.forEach(doc => {
      const ext = getFileExtension(doc.filename);
      types.add(ext);
    });
    return Array.from(types).sort();
  }, [documents]);

  // File type icon mapping
  const getFileTypeIcon = (extension: string) => {
    switch (extension.toUpperCase()) {
      case 'PDF':
        return <File className="h-3 w-3" />;
      case 'XLSX':
      case 'XLS':
        return <Sheet className="h-3 w-3" />;
      case 'DOC':
      case 'DOCX':
        return <FileText className="h-3 w-3" />;
      case 'PPT':
      case 'PPTX':
        return <Presentation className="h-3 w-3" />;
      case 'TXT':
        return <FileText className="h-3 w-3" />;
      case 'JSON':
        return <FileCode className="h-3 w-3" />;
      default:
        return <File className="h-3 w-3" />;
    }
  };

  // Reset temp selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setTempSelectedIds(selectedDocumentIds);
      setSearchQuery("");
      setSelectedFileTypes([]);
    }
  }, [isOpen, selectedDocumentIds]);

  // Filter documents based on search query and file types
  const filteredDocuments = useMemo(() => {
    let filtered = documents;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(doc => 
        doc.filename.toLowerCase().includes(query) ||
        doc.id.toLowerCase().includes(query)
      );
    }

    // Filter by file types
    if (selectedFileTypes.length > 0) {
      filtered = filtered.filter(doc => {
        const ext = getFileExtension(doc.filename);
        return selectedFileTypes.includes(ext);
      });
    }

    return filtered;
  }, [documents, searchQuery, selectedFileTypes]);

  // Handle file type filter toggle
  const handleFileTypeToggle = (fileType: string) => {
    setSelectedFileTypes(prev => {
      if (prev.includes(fileType)) {
        return prev.filter(type => type !== fileType);
      } else {
        return [...prev, fileType];
      }
    });
  };

  // Clear all filters
  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedFileTypes([]);
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Format upload date
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);
    const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

    if (diffInHours < 1) {
      return "Just now";
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInDays < 7) {
      return `${Math.floor(diffInDays)}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  // Handle document selection
  const handleDocumentToggle = (documentId: string) => {
    if (mode === "single") {
      // Single select mode - replace selection
      setTempSelectedIds([documentId]);
    } else {
      // Multi select mode - toggle selection
      setTempSelectedIds(prev => {
        if (prev.includes(documentId)) {
          return prev.filter(id => id !== documentId);
        } else {
          return [...prev, documentId];
        }
      });
    }
  };

  // Handle select all / deselect all
  const handleSelectAll = () => {
    if (tempSelectedIds.length === filteredDocuments.length) {
      setTempSelectedIds([]);
    } else {
      setTempSelectedIds(filteredDocuments.map(doc => doc.id));
    }
  };

  // Handle apply selection
  const handleApply = () => {
    onSelectionChange(tempSelectedIds);
    onClose();
  };

  // Handle cancel
  const handleCancel = () => {
    setTempSelectedIds(selectedDocumentIds);
    onClose();
  };

  // Check if selection has changed
  const hasChanges = tempSelectedIds.length !== selectedDocumentIds.length || 
    !tempSelectedIds.every(id => selectedDocumentIds.includes(id));

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent 
        className={cn(
          "max-w-3xl w-[95vw] h-[85vh] flex flex-col",
          isMobile && "max-w-[95vw] h-[90vh] rounded-lg",
          className
        )}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="flex-shrink-0 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Select Documents
          </DialogTitle>
          <DialogDescription>
            {mode === "single" 
              ? "Choose one document to focus your search on."
              : "Choose documents to focus your search on. Leave empty to search all documents."
            }
          </DialogDescription>
        </DialogHeader>

        {/* Search and filters */}
        <div className="flex-shrink-0 space-y-4">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* File type filters - only show if there are multiple types */}
          {availableFileTypes.length > 1 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">File Types:</span>
                {(searchQuery || selectedFileTypes.length > 0) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    className="text-xs h-6 px-2"
                  >
                    Clear filters
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {availableFileTypes.map((fileType) => {
                  const isSelected = selectedFileTypes.includes(fileType);
                  const typeCount = documents.filter(doc => getFileExtension(doc.filename) === fileType).length;
                  
                  return (
                    <Button
                      key={fileType}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleFileTypeToggle(fileType)}
                      className="h-7 px-3 text-xs gap-1"
                    >
                      {getFileTypeIcon(fileType)}
                      {fileType}
                      <Badge 
                        variant={isSelected ? "secondary" : "outline"} 
                        className="ml-1 text-xs px-1 py-0 h-4 min-w-4"
                      >
                        {typeCount}
                      </Badge>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Document count and controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {filteredDocuments.length} of {documents.length} document{documents.length !== 1 ? 's' : ''}
                </Badge>
                {tempSelectedIds.length > 0 && (
                  <Badge variant="default">
                    {tempSelectedIds.length} selected
                  </Badge>
                )}
              </div>
            </div>

            {/* Select all button (multi mode only) */}
            {mode === "multi" && filteredDocuments.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="text-xs"
              >
                {tempSelectedIds.length === filteredDocuments.length ? "Deselect All" : "Select All"}
              </Button>
            )}
          </div>
        </div>

        {/* Document list with fixed height and scroll */}
        <div className="flex-1 min-h-0 border rounded-md bg-background">
          <ScrollArea className="h-full p-2">
            <div className="space-y-2 pr-2">
              <AnimatePresence>
                {filteredDocuments.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center h-32 text-muted-foreground"
                  >
                    <FileIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm text-center">
                      {searchQuery || selectedFileTypes.length > 0
                        ? "No documents match your filters" 
                        : "No documents available"
                      }
                    </p>
                    <p className="text-xs mt-1 text-center">
                      {searchQuery || selectedFileTypes.length > 0
                        ? "Try adjusting your search or filters"
                        : "Upload some documents to get started"
                      }
                    </p>
                  </motion.div>
                )}

                {filteredDocuments.map((document, index) => {
                  const isSelected = tempSelectedIds.includes(document.id);
                  
                  return (
                    <motion.div
                      key={document.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ delay: index * 0.03 }}
                      className={cn(
                        "group relative rounded-lg border transition-all cursor-pointer p-3",
                        "hover:border-primary/50 hover:bg-muted/20",
                        isSelected && "border-primary bg-primary/5 shadow-sm",
                        !isSelected && "border-border"
                      )}
                      onClick={() => handleDocumentToggle(document.id)}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox/selection indicator */}
                        <div className="flex-shrink-0 pt-1">
                          {mode === "single" ? (
                            <div className={cn(
                              "w-4 h-4 rounded-full border-2 transition-colors",
                              isSelected 
                                ? "border-primary bg-primary" 
                                : "border-muted-foreground group-hover:border-primary"
                            )}>
                              {isSelected && (
                                <div className="w-full h-full rounded-full bg-primary-foreground scale-50" />
                              )}
                            </div>
                          ) : (
                            <Checkbox
                              checked={isSelected}
                              onChange={() => handleDocumentToggle(document.id)}
                              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                            />
                          )}
                        </div>

                        {/* Document info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className={cn(
                                  "font-medium text-sm line-clamp-2 transition-colors",
                                  isSelected ? "text-primary" : "text-foreground group-hover:text-primary"
                                )}>
                                  {document.filename}
                                </h4>
                                <Badge 
                                  variant="outline" 
                                  className={cn(
                                    "text-xs flex-shrink-0 gap-1",
                                    isSelected && "border-primary/50 text-primary"
                                  )}
                                >
                                  {getFileTypeIcon(getFileExtension(document.filename))}
                                  {getFileExtension(document.filename)}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-muted-foreground">
                                  {formatFileSize(document.size)}
                                </span>
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground">
                                    {formatDate(document.uploadedAt)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </ScrollArea>
        </div>

        {/* Footer */}
        <DialogFooter className="flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <div className="text-xs text-muted-foreground">
              {tempSelectedIds.length === 0 
                ? "No filters applied - will search all documents"
                : `Will search in ${tempSelectedIds.length} document${tempSelectedIds.length !== 1 ? 's' : ''}`
              }
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleCancel}
              >
                Cancel
              </Button>
              <Button
                onClick={handleApply}
                disabled={!hasChanges}
              >
                Apply Selection
                {tempSelectedIds.length > 0 && (
                  <Badge variant="secondary" className="ml-2 bg-primary-foreground text-primary">
                    {tempSelectedIds.length}
                  </Badge>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}