import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Library, File, Eye, Calendar, Trash2, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { API_ENDPOINTS, apiRequest } from "@/lib/api-config";

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

  // Auto-load preview when component mounts
  useEffect(() => {
    const loadPreview = async () => {
      setLoading(true);
      setError(null);
      
      try {
        //console.log(`[DEBUG] Loading preview for document: ${document.id}`);
        // Fetch document content from Python API
        const data = await apiRequest<{content: string}>(API_ENDPOINTS.DOCUMENT_CONTENT(document.id));
        //console.log(`[DEBUG] Content loaded successfully, length: ${data.content?.length || 0}`);
        setContent(data.content || 'No content available');
        setLoading(false);
      } catch (err) {
        console.error('Error loading document preview:', err);
        setError(`Failed to load document preview: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setLoading(false);
      }
    };

    loadPreview();
  }, [document.id]); // Re-load if document changes

  const retryLoad = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log(`[DEBUG] Retrying preview load for document: ${document.id}`);
      const data = await apiRequest<{content: string}>(API_ENDPOINTS.DOCUMENT_CONTENT(document.id));
      //console.log(`[DEBUG] Content loaded successfully on retry, length: ${data.content?.length || 0}`);
      setContent(data.content || 'No content available');
      setLoading(false);
    } catch (err) {
      console.error('Error loading document preview on retry:', err);
      setError(`Failed to load document preview: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setLoading(false);
    }
  };

  return (
    <DialogContent className="max-w-4xl max-h-[80vh]">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <File className="h-5 w-5" />
          {document.filename}
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
        </div>        <ScrollArea className="h-96 w-full border rounded-md p-4">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}
          
          {error && (
            <div className="flex items-center justify-center h-full text-destructive">
              {error}
            </div>
          )}
          
          {content && (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed">
              {content}
            </pre>
          )}
          
          {!content && !loading && !error && (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Loading document content...
            </div>
          )}
        </ScrollArea>
      </div>
    </DialogContent>
  );
}

export function DocumentLibrary({ documents = [], onRefresh, onDeleteDocument }: DocumentLibraryProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const { toast } = useToast();

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
    if (!onDeleteDocument) return;
    
    try {
      await onDeleteDocument(documentId);
      toast({
        title: "Document deleted",
        description: `${filename} has been removed from the library.`,
      });
      onRefresh();
    } catch (error) {
      toast({
        title: "Delete failed",
        description: "Failed to delete the document. Please try again.",
        variant: "destructive",
      });
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
              {filteredDocuments.length === 0 ? (
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
                      <Card className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0">
                              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                <File className="h-5 w-5 text-primary" />
                              </div>
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-medium truncate">
                                  {document.filename}
                                </h4>
                                <Badge variant="outline" className="text-xs">
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
                            
                            <div className="flex items-center gap-1">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
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
                              
                              {onDeleteDocument && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => handleDelete(document.id, document.filename)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
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
              onClick={onRefresh}
              className="w-full"
            >
              Refresh Library
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}