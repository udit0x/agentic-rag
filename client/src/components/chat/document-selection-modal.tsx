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
      setIsInitialRender(true);
    }
  }, [isOpen, selectedDocumentIds]);

  // 🔒 CRITICAL: Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    
    // Cleanup on unmount
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

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

  // Track if this is initial render to prevent animation flicker
  const [isInitialRender, setIsInitialRender] = useState(true);
  
  useEffect(() => {
    if (isOpen && isInitialRender) {
      setIsInitialRender(false);
    }
  }, [isOpen, isInitialRender]);

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
          "max-w-3xl w-[95vw] flex flex-col gap-0 p-0",
          isMobile 
            ? "h-[100dvh] w-[100vw] max-w-[100vw] rounded-none m-0 top-0 left-0 translate-x-0 translate-y-0" 
            : "h-[85vh]",
          className
        )}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="flex-shrink-0 pb-3 sm:pb-4 px-4 sm:px-6 pt-4 sm:pt-6 border-b">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Filter className="h-4 w-4 sm:h-5 sm:w-5" />
            {isMobile ? "Select Docs" : "Select Documents"}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {mode === "single" 
              ? (isMobile ? "Choose one document." : "Choose one document to focus your search on.")
              : (isMobile 
                  ? "Choose docs to focus search. Leave empty to search all."
                  : "Choose documents to focus your search on. Leave empty to search all documents."
                )
            }
          </DialogDescription>
        </DialogHeader>

        {/* Search and filters */}
        <div className="flex-shrink-0 space-y-3 sm:space-y-4 px-4 sm:px-6 pt-3 sm:pt-4">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
            <Input
              placeholder={isMobile ? "Search..." : "Search documents by name..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 sm:pl-9 h-9 sm:h-10 text-sm"
            />
          </div>

          {/* File type filters - only show if there are multiple types */}
          {availableFileTypes.length > 1 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                  {isMobile ? "Types:" : "File Types:"}
                </span>
                {(searchQuery || selectedFileTypes.length > 0) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    className="text-[10px] sm:text-xs h-6 px-2"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {availableFileTypes.map((fileType) => {
                  const isSelected = selectedFileTypes.includes(fileType);
                  const typeCount = documents.filter(doc => getFileExtension(doc.filename) === fileType).length;
                  
                  return (
                    <Button
                      key={fileType}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleFileTypeToggle(fileType)}
                      className="h-6 sm:h-7 px-2 sm:px-3 text-[10px] sm:text-xs gap-1"
                    >
                      {getFileTypeIcon(fileType)}
                      {fileType}
                      <Badge 
                        variant={isSelected ? "secondary" : "outline"} 
                        className="ml-1 text-[10px] px-1 py-0 h-3.5 sm:h-4 min-w-3.5 sm:min-w-4"
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
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Badge variant="secondary" className="text-[10px] sm:text-xs h-5 sm:h-6">
                  {filteredDocuments.length} of {documents.length}
                </Badge>
                {tempSelectedIds.length > 0 && (
                  <Badge variant="default" className="text-[10px] sm:text-xs h-5 sm:h-6">
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
                className="text-[10px] sm:text-xs h-6 sm:h-7 px-2 sm:px-3 flex-shrink-0"
              >
                {tempSelectedIds.length === filteredDocuments.length 
                  ? (isMobile ? "Clear" : "Deselect All") 
                  : (isMobile ? "All" : "Select All")
                }
              </Button>
            )}
          </div>
        </div>

        {/* Document list with fixed height and scroll */}
        <div className="flex-1 min-h-0 border-t border-b sm:border sm:rounded-md bg-background mx-4 sm:mx-6 my-3 sm:my-4">
          <ScrollArea 
            className="h-full"
            style={{
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch"
            }}
          >
            <div className="space-y-2 p-2 sm:p-3">
              <AnimatePresence mode="sync">
                {filteredDocuments.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center h-32 sm:h-40 text-muted-foreground"
                  >
                    <FileIcon className="h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs sm:text-sm text-center px-4">
                      {searchQuery || selectedFileTypes.length > 0
                        ? (isMobile ? "No match" : "No documents match your filters")
                        : (isMobile ? "No documents" : "No documents available")
                      }
                    </p>
                    <p className="text-[10px] sm:text-xs mt-1 text-center px-4">
                      {searchQuery || selectedFileTypes.length > 0
                        ? (isMobile ? "Try different filters" : "Try adjusting your search or filters")
                        : (isMobile ? "Upload docs to start" : "Upload some documents to get started")
                      }
                    </p>
                  </motion.div>
                )}

                {filteredDocuments.map((document) => {
                  const isSelected = tempSelectedIds.includes(document.id);
                  
                  return (
                    <motion.div
                      key={document.id}
                      layout
                      initial={isInitialRender ? { opacity: 1, y: 0 } : { opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ 
                        duration: 0.15,
                        ease: "easeOut"
                      }}
                      className={cn(
                        "group relative rounded-lg border transition-all cursor-pointer p-2.5 sm:p-3 touch-manipulation",
                        "hover:border-primary/50 hover:bg-muted/20",
                        isSelected && "border-primary bg-primary/5 shadow-sm",
                        !isSelected && "border-border"
                      )}
                      onClick={() => handleDocumentToggle(document.id)}
                    >
                      <div className="flex items-start gap-2 sm:gap-3">
                        {/* Checkbox/selection indicator */}
                        <div className="flex-shrink-0 pt-0.5 sm:pt-1">
                          {mode === "single" ? (
                            <div className={cn(
                              "w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 transition-colors",
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
                              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary h-4 w-4 sm:h-5 sm:w-5"
                            />
                          )}
                        </div>

                        {/* Document info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-1.5 sm:gap-2 mb-1">
                                <h4 className={cn(
                                  "font-medium text-xs sm:text-sm line-clamp-2 flex-1 transition-colors leading-tight",
                                  isSelected ? "text-primary" : "text-foreground group-hover:text-primary"
                                )}>
                                  {document.filename}
                                </h4>
                                <Badge 
                                  variant="outline" 
                                  className={cn(
                                    "text-[10px] sm:text-xs flex-shrink-0 gap-1 h-4 sm:h-5",
                                    isSelected && "border-primary/50 text-primary"
                                  )}
                                >
                                  {getFileTypeIcon(getFileExtension(document.filename))}
                                  {getFileExtension(document.filename)}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 sm:gap-3 mt-1 flex-wrap">
                                <span className="text-[10px] sm:text-xs text-muted-foreground">
                                  {formatFileSize(document.size)}
                                </span>
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  <span className="text-[10px] sm:text-xs text-muted-foreground">
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
        <DialogFooter className={cn(
          "flex-shrink-0 px-4 sm:px-6 pt-3 sm:pt-4 border-t",
          isMobile ? "pb-6 safe-bottom" : "pb-4 sm:pb-6"
        )}>
          <div className={cn(
            "w-full",
            isMobile ? "space-y-3" : "flex items-center justify-between"
          )}>
            <div className={cn(
              "text-[10px] sm:text-xs text-muted-foreground",
              isMobile && "text-center"
            )}>
              {tempSelectedIds.length === 0 
                ? (isMobile ? "No filters - searching all" : "No filters applied - will search all documents")
                : tempSelectedIds.length === 1
                ? (isMobile ? "1 doc - optimal" : "Searching 1 document - optimal for best results")
                : (isMobile 
                    ? `${tempSelectedIds.length} docs selected`
                    : `Will search in ${tempSelectedIds.length} documents. Tip: Works best with a single document.`
                  )
              }
            </div>
            
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={handleCancel}
                className={cn(
                  isMobile ? "flex-1 h-10 text-sm" : "h-9"
                )}
              >
                Cancel
              </Button>
              <Button
                onClick={handleApply}
                disabled={!hasChanges}
                className={cn(
                  isMobile ? "flex-1 h-10 text-sm" : "h-9"
                )}
              >
                {isMobile ? "Apply" : "Apply Selection"}
                {tempSelectedIds.length > 0 && (
                  <Badge variant="secondary" className="ml-2 bg-primary-foreground text-primary text-[10px] sm:text-xs h-4 sm:h-5">
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