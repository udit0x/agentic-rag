import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Library, File, Eye, Calendar, Trash2, Download, Search, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useCachedDocuments, useCachedDocumentContent } from "@/hooks/use-cached-api";

// Custom scrollbar styles
const scrollbarStyles = `
  .custom-scroll::-webkit-scrollbar {
    width: 12px;
    height: 12px;
  }
  
  .custom-scroll::-webkit-scrollbar-track {
    background: hsl(var(--muted));
    border-radius: 6px;
  }
  
  .custom-scroll::-webkit-scrollbar-thumb {
    background: hsl(var(--muted-foreground) / 0.3);
    border-radius: 6px;
    border: 2px solid hsl(var(--muted));
  }
  
  .custom-scroll::-webkit-scrollbar-thumb:hover {
    background: hsl(var(--muted-foreground) / 0.5);
  }
  
  .custom-scroll::-webkit-scrollbar-corner {
    background: hsl(var(--muted));
  }

  /* Mobile touch improvements */
  @media (max-width: 640px) {
    .document-card {
      min-height: 72px; /* Ensure adequate touch target size */
    }
    
    .document-actions {
      min-width: 72px; /* Ensure buttons don't get cut off */
    }
    
    .document-content {
      padding-right: 8px; /* Extra space to prevent overlap */
    }
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = scrollbarStyles;
  document.head.appendChild(styleElement);
}

interface Document {
  id: string;
  filename: string;
  size: number;
  uploadedAt: string;
}

interface DocumentLibraryProps {
  documents?: Document[];
  onRefresh: () => void;
  onDeleteDocument?: (documentId: string) => void;
}

interface DocumentPreviewProps {
  document: Document;
  onClose: () => void;
}

function DocumentPreview({ document, onClose }: DocumentPreviewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); // Start with loading true
  const [error, setError] = useState<string | null>(null);
  const { fetchDocumentContent } = useCachedDocumentContent();

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileExtension = (filename: string) => {
    return filename.split('.').pop()?.toUpperCase() || 'FILE';
  };

  const isTxtFile = (filename: string) => {
    const ext = getFileExtension(filename).toLowerCase();
    return ['txt', 'text', 'log', 'md', 'readme'].includes(ext);
  };

  // Auto-load preview when component mounts or document changes
  useEffect(() => {
    const loadPreview = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const documentContent = await fetchDocumentContent(document.id);
        setContent(documentContent || 'No content available');
        setLoading(false);
      } catch (err) {
        console.error('Error loading document preview:', err);
        setError(`Failed to load document preview: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setLoading(false);
      }
    };

    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document.id]); // Only re-load if document ID changes, NOT fetchDocumentContent

  const retryLoad = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // console.log(`[DEBUG] Retrying preview load for document: ${document.id}`);
      const documentContent = await fetchDocumentContent(document.id);
      setContent(documentContent || 'No content available');
      setLoading(false);
    } catch (err) {
      console.error('Error loading document preview on retry:', err);
      setError(`Failed to load document preview: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setLoading(false);
    }
  };

  return (
    <DialogContent className="max-w-6xl max-h-[90vh] w-[95vw] sm:w-[90vw] overflow-hidden p-3 sm:p-6">
      <DialogHeader className="space-y-2">
        <DialogTitle className="flex items-start gap-2 text-sm sm:text-base pr-8">
          <File className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 mt-0.5" />
          <span className="break-words flex-1 min-w-0 leading-tight">{document.filename}</span>
          <Badge variant="outline" className="text-[10px] sm:text-xs flex-shrink-0 h-5 ml-1">
            {getFileExtension(document.filename)}
          </Badge>
        </DialogTitle>
        <DialogDescription className="text-xs sm:text-sm break-words">
          Preview of {document.filename} ({formatFileSize(document.size)})
        </DialogDescription>
      </DialogHeader>
      
        <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground flex-wrap">
            <span className="flex-shrink-0">Size: {(document.size / 1024).toFixed(1)} KB</span>
            <span className="flex-shrink-0">Uploaded: {new Date(document.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
          
          {error && (
            <Button onClick={retryLoad} size="sm" variant="outline" className="text-xs h-8">
              <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
              Retry
            </Button>
          )}
        </div>        <div
          className="relative border rounded-md bg-background h-[50vh] sm:h-[60vh] w-full custom-scroll"
          style={{
            overflowX: isTxtFile(document.filename) ? "hidden" : "auto",
            overflowY: "auto",
          }}
        >
          <div
            className="absolute inset-0 p-3 sm:p-4"
            style={{
              width: isTxtFile(document.filename) ? "100%" : "fit-content",
              minWidth: isTxtFile(document.filename) ? "auto" : "100%",
            }}
          >
            {loading && (
              <div className="flex items-center justify-center h-full w-full">
                <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-primary"></div>
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center h-full w-full text-destructive text-xs sm:text-sm text-center px-4">
                {error}
              </div>
            )}

            {content && (
              <pre
                className={`text-[10px] sm:text-xs leading-relaxed font-mono ${
                  isTxtFile(document.filename) 
                    ? "whitespace-pre-wrap word-break-break-word" 
                    : "whitespace-pre"
                }`}
                style={{
                  display: "block",
                  minWidth: isTxtFile(document.filename) ? "auto" : "800px",
                  paddingBottom: "2rem",
                  width: "100%",
                }}
              >
                {content}
              </pre>
            )}

            {!content && !loading && !error && (
              <div className="flex items-center justify-center h-full w-full text-muted-foreground text-xs sm:text-sm">
                Loading document content...
              </div>
            )}
          </div>
        </div>
      </div>
    </DialogContent>
  );
}

// Smart animated delete button component
function AnimatedDeleteButton({ 
  isDeleting, 
  onClick, 
  disabled = false 
}: { 
  isDeleting: boolean; 
  onClick: () => void; 
  disabled?: boolean; 
}) {
  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className={`h-8 w-8 sm:h-9 sm:w-9 transition-all duration-200 touch-manipulation ${
          isDeleting 
            ? 'text-destructive/40 cursor-not-allowed' 
            : 'text-destructive hover:text-destructive hover:bg-destructive/10 active:bg-destructive/20'
        }`}
        onClick={onClick}
        disabled={disabled || isDeleting}
      >
        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </Button>
      
      {/* Loading spinner beside the button */}
      {isDeleting && (
        <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-background border border-destructive/30 shadow-sm">
          <div className="w-full h-full rounded-full border border-transparent border-t-destructive animate-spin"></div>
        </div>
      )}
    </div>
  );
}

export function DocumentLibrary({ documents: propDocuments = [], onRefresh, onDeleteDocument }: DocumentLibraryProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [deletingDocuments, setDeletingDocuments] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  
  // Use cached documents hook
  const { fetchDocuments, refreshDocuments, deleteDocument: deleteCachedDocument } = useCachedDocuments();
  const [documents, setDocuments] = useState<Document[]>(propDocuments);

  // Load documents with cache on component mount
  useEffect(() => {
    const loadDocuments = async () => {
      // If we already have prop documents, don't show loading
      if (propDocuments.length === 0) {
        setIsLoading(true);
      }
      
      try {
        const cachedDocs = await fetchDocuments();
        // Only update if we got valid data
        if (Array.isArray(cachedDocs)) {
          setDocuments(cachedDocs);
          // console.log(`Loaded ${cachedDocs.length} documents from cache/API`);
        }
      } catch (error) {
        console.error('Error loading documents from cache:', error);
        // Keep prop documents if cache fails and we don't have cached data
        if (documents.length === 0 && propDocuments.length > 0) {
          // console.log('Fallback to prop documents');
          setDocuments(propDocuments);
        }
      } finally {
        setIsLoading(false);
      }
    };

    // Only load if we don't have documents or if forced refresh
    if (documents.length === 0 || isRefreshing) {
      loadDocuments();
    }
  }, []); // Only run once on mount

  // Update documents when props change (fallback)
  useEffect(() => {
    if (propDocuments.length > 0 && documents.length === 0 && !isLoading) {
      // console.log('Using prop documents as fallback');
      setDocuments(propDocuments);
    }
  }, [propDocuments, documents.length, isLoading]);

  const filteredDocuments = documents.filter(doc =>
    doc.filename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileExtension = (filename: string) => {
    return filename.split('.').pop()?.toUpperCase() || 'FILE';
  };

  const handleDelete = async (documentId: string, filename: string) => {
    // Add document to deleting set
    setDeletingDocuments(prev => new Set(prev).add(documentId));
    
    try {
      // Use cached delete if available, otherwise use prop callback
      if (deleteCachedDocument) {
        await deleteCachedDocument(documentId);
      } else if (onDeleteDocument) {
        await onDeleteDocument(documentId);
      }
      
      toast({
        title: "Document deleted",
        description: `${filename} has been removed from the library.`,
      });
      
      // Refresh documents list
      handleRefresh();
    } catch (error) {
      toast({
        title: "Delete failed",
        description: "Failed to delete the document. Please try again.",
        variant: "destructive",
      });
    } finally {
      // Remove document from deleting set
      setDeletingDocuments(prev => {
        const newSet = new Set(prev);
        newSet.delete(documentId);
        return newSet;
      });
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Invalidate cache and fetch fresh data
      refreshDocuments();
      const freshDocs = await fetchDocuments(true); // Force refresh
      setDocuments(freshDocs);
      
      // Also call the prop callback if provided
      if (onRefresh) {
        onRefresh();
      }
      
      toast({
        title: "Library refreshed",
        description: "Document library has been updated.",
      });
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: "Failed to refresh the library. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base flex-wrap">
            <Library className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
            <span className="flex-shrink-0">Document Library</span>
            <Badge variant="secondary" className="ml-auto text-xs flex-shrink-0">
              {documents.length} document{documents.length !== 1 ? 's' : ''}
            </Badge>
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4 p-3 sm:p-6 pt-0 sm:pt-0">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 sm:pl-10 h-9 sm:h-10 text-xs sm:text-sm"
            />
          </div>

          {/* Document List */}
          <div className="border rounded-md">
            <ScrollArea 
              className="h-80 sm:h-96"
              style={{
                overscrollBehavior: "contain",
                WebkitOverflowScrolling: "touch"
              }}
            >
              <div className="p-1.5 sm:p-2 space-y-1.5 sm:space-y-2">
                <AnimatePresence>
                  {isLoading ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center justify-center h-32 text-muted-foreground"
                    >
                      <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-primary mb-2"></div>
                      <p className="text-xs sm:text-sm">Loading documents...</p>
                    </motion.div>
                  ) : filteredDocuments.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center justify-center h-32 text-muted-foreground"
                    >
                      <Library className="h-6 w-6 sm:h-8 sm:w-8 mb-2" />
                      <p className="text-xs sm:text-sm text-center px-4">{searchTerm ? 'No documents match your search' : 'No documents uploaded yet'}</p>
                    </motion.div>
                  ) : (
                    <>
                      {filteredDocuments.map((document, index) => (
                        <motion.div
                          key={document.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ delay: index * 0.05 }}
                        >
                          <Card className={`document-card transition-all duration-200 ${
                            deletingDocuments.has(document.id) 
                              ? 'opacity-60 pointer-events-none' 
                              : 'hover:shadow-md'
                          }`}>
                            <CardContent className="p-3 sm:p-4">
                              {/* Desktop Layout */}
                              <div className="hidden sm:flex items-start gap-2 sm:gap-3">
                                <div className="flex-shrink-0 pt-0.5">
                                  <div className={`w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center transition-all duration-200 ${
                                    deletingDocuments.has(document.id) ? 'bg-destructive/10' : ''
                                  }`}>
                                    <File className={`h-5 w-5 transition-colors duration-200 ${
                                      deletingDocuments.has(document.id) 
                                        ? 'text-destructive/60' 
                                        : 'text-primary'
                                    }`} />
                                  </div>
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start gap-2 mb-1">
                                    <h4 className="text-sm font-medium truncate flex-1 min-w-0 leading-tight">
                                      {document.filename}
                                    </h4>
                                    <Badge variant="outline" className="text-xs flex-shrink-0 h-5">
                                      {getFileExtension(document.filename)}
                                    </Badge>
                                  </div>
                                  
                                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {new Date(document.uploadedAt).toLocaleDateString()}
                                    </span>
                                    <span>{formatFileSize(document.size)}</span>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 touch-manipulation hover:bg-primary/10 active:bg-primary/20"
                                        onClick={() => setSelectedDocument(document)}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    </DialogTrigger>
                                    {selectedDocument && (
                                      <DocumentPreview
                                        document={selectedDocument}
                                        onClose={() => setSelectedDocument(null)}
                                      />
                                    )}
                                  </Dialog>
                                  
                                  <AnimatedDeleteButton
                                    isDeleting={deletingDocuments.has(document.id)}
                                    onClick={() => handleDelete(document.id, document.filename)}
                                  />
                                </div>
                              </div>

                              {/* Mobile Layout */}
                              <div className="sm:hidden space-y-2">
                                <div className="flex items-start gap-2">
                                  <div className="flex-shrink-0 pt-0.5">
                                    <div className={`w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center transition-all duration-200 ${
                                      deletingDocuments.has(document.id) ? 'bg-destructive/10' : ''
                                    }`}>
                                      <File className={`h-4 w-4 transition-colors duration-200 ${
                                        deletingDocuments.has(document.id) 
                                          ? 'text-destructive/60' 
                                          : 'text-primary'
                                      }`} />
                                    </div>
                                  </div>
                                  
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start gap-1 mb-1.5">
                                      <h4 className="text-xs font-medium leading-tight flex-1 min-w-0 break-words line-clamp-2">
                                        {document.filename}
                                      </h4>
                                      <Badge variant="outline" className="text-[10px] flex-shrink-0 h-5 ml-1">
                                        {getFileExtension(document.filename)}
                                      </Badge>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                                      <span className="flex items-center gap-1 flex-shrink-0">
                                        <Calendar className="h-3 w-3" />
                                        {new Date(document.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                      </span>
                                      <span className="flex-shrink-0">{formatFileSize(document.size)}</span>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Action Buttons Row for Mobile */}
                                <div className="flex items-center justify-end gap-1 pl-11 border-t border-border/50 pt-2">
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 flex-1 text-xs touch-manipulation"
                                        onClick={() => setSelectedDocument(document)}
                                      >
                                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                                        Preview
                                      </Button>
                                    </DialogTrigger>
                                    {selectedDocument && (
                                      <DocumentPreview
                                        document={selectedDocument}
                                        onClose={() => setSelectedDocument(null)}
                                      />
                                    )}
                                  </Dialog>
                                  
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className={`h-8 flex-1 text-xs transition-all duration-200 touch-manipulation ${
                                      deletingDocuments.has(document.id) 
                                        ? 'text-destructive/40 cursor-not-allowed' 
                                        : 'text-destructive hover:text-destructive hover:bg-destructive/10 active:bg-destructive/20'
                                    }`}
                                    onClick={() => handleDelete(document.id, document.filename)}
                                    disabled={deletingDocuments.has(document.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                    {deletingDocuments.has(document.id) ? 'Deleting...' : 'Delete'}
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </>
                  )}
                </AnimatePresence>
              </div>
            </ScrollArea>
          </div>
          
          {/* Refresh Button */}
          <div className="flex justify-center pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-full h-9 text-xs sm:text-sm"
            >
              <RotateCcw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Library'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}