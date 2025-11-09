import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Library, File, Eye, Calendar, Trash2, Download, Search, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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

  const getFileExtension = (filename: string) => {
    return filename.split('.').pop()?.toUpperCase() || 'FILE';
  };

  const isTxtFile = (filename: string) => {
    const ext = getFileExtension(filename).toLowerCase();
    return ['txt', 'text', 'log', 'md', 'readme'].includes(ext);
  };

  // Auto-load preview when component mounts
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
  }, [document.id, fetchDocumentContent]); // Re-load if document changes

  const retryLoad = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log(`[DEBUG] Retrying preview load for document: ${document.id}`);
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
    <DialogContent className="max-w-6xl max-h-[90vh] w-[95vw] overflow-hidden">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 flex-shrink-0">
          <File className="h-5 w-5" />
          <span className="truncate">{document.filename}</span>
          <Badge variant="outline" className="ml-2 flex-shrink-0">
            {getFileExtension(document.filename)}
          </Badge>
        </DialogTitle>
      </DialogHeader>
      
        <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Size: {(document.size / 1024).toFixed(1)} KB</span>
            <span>Uploaded: {new Date(document.uploadedAt).toLocaleDateString()}</span>
          </div>
          
          {error && (
            <Button onClick={retryLoad} size="sm" variant="outline">
              <Eye className="h-4 w-4 mr-2" />
              Retry
            </Button>
          )}
        </div>        <div
          className="relative border rounded-md bg-background h-[60vh] w-full custom-scroll"
          style={{
            overflowX: isTxtFile(document.filename) ? "hidden" : "auto",
            overflowY: "auto",
          }}
        >
          <div
            className="absolute inset-0 p-4"
            style={{
              width: isTxtFile(document.filename) ? "100%" : "fit-content",
              minWidth: isTxtFile(document.filename) ? "auto" : "100%",
            }}
          >
            {loading && (
              <div className="flex items-center justify-center h-full w-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center h-full w-full text-destructive">
                {error}
              </div>
            )}

            {content && (
              <pre
                className={`text-xs leading-relaxed font-mono ${
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
              <div className="flex items-center justify-center h-full w-full text-muted-foreground">
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
        className={`h-8 w-8 sm:h-8 sm:w-8 transition-all duration-200 touch-manipulation ${
          isDeleting 
            ? 'text-destructive/40 cursor-not-allowed' 
            : 'text-destructive hover:text-destructive hover:bg-destructive/10 active:bg-destructive/20'
        }`}
        onClick={onClick}
        disabled={disabled || isDeleting}
      >
        <Trash2 className="h-4 w-4" />
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
          console.log(`📋 Loaded ${cachedDocs.length} documents from cache/API`);
        }
      } catch (error) {
        console.error('Error loading documents from cache:', error);
        // Keep prop documents if cache fails and we don't have cached data
        if (documents.length === 0 && propDocuments.length > 0) {
          console.log('📋 Fallback to prop documents');
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
      console.log('📋 Using prop documents as fallback');
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
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Library className="h-5 w-5" />
            Document Library
            <Badge variant="secondary" className="ml-auto">
              {documents.length} document{documents.length !== 1 ? 's' : ''}
            </Badge>
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Document List */}
          <ScrollArea className="h-96">
            <AnimatePresence>
              {isLoading ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center h-32 text-muted-foreground"
                >
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
                  <p>Loading documents...</p>
                </motion.div>
              ) : filteredDocuments.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center h-32 text-muted-foreground"
                >
                  <Library className="h-8 w-8 mb-2" />
                  <p>{searchTerm ? 'No documents match your search' : 'No documents uploaded yet'}</p>
                </motion.div>
              ) : (
                <div className="space-y-2">
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
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className="flex-shrink-0">
                              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center transition-all duration-200 ${
                                deletingDocuments.has(document.id) ? 'bg-destructive/10' : ''
                              }`}>
                                <File className={`h-4 w-4 sm:h-5 sm:w-5 transition-colors duration-200 ${
                                  deletingDocuments.has(document.id) 
                                    ? 'text-destructive/60' 
                                    : 'text-primary'
                                }`} />
                              </div>
                            </div>
                            
                            <div className="flex-1 min-w-0 document-content">
                              <div className="flex items-center gap-1 sm:gap-2 mb-1">
                                <h4 className="text-xs sm:text-sm font-medium truncate">
                                  {document.filename}
                                </h4>
                                <Badge variant="outline" className="text-xs flex-shrink-0">
                                  {getFileExtension(document.filename)}
                                </Badge>
                              </div>
                              
                              <div className="flex items-center gap-2 sm:gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  <span className="hidden xs:inline">{new Date(document.uploadedAt).toLocaleDateString()}</span>
                                  <span className="xs:hidden">{new Date(document.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                </span>
                                <span className="flex-shrink-0">{formatFileSize(document.size)}</span>
                              </div>
                            </div>
                            
                            <div className="document-actions flex items-center gap-1 flex-shrink-0">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 sm:h-8 sm:w-8 touch-manipulation hover:bg-primary/10 active:bg-primary/20"
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
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </AnimatePresence>
          </ScrollArea>
          
          {/* Refresh Button */}
          <div className="flex justify-center pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-full"
            >
              <RotateCcw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Library'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}