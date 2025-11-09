import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, Plus, X, FileText } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { DocumentSelectionModal } from "./document-selection-modal";

interface Document {
  id: string;
  filename: string;
  size: number;
  uploadedAt: string;
}

interface MessageInputProps {
  onSubmit: (message: string, selectedDocumentIds?: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  documents?: Document[];
  selectedDocumentIds?: string[];
  onDocumentSelectionChange?: (documentIds: string[]) => void;
}

interface MessageInputRef {
  focus: () => void;
}

export const MessageInput = forwardRef<MessageInputRef, MessageInputProps>(({
  onSubmit,
  disabled = false,
  placeholder = "Ask a question about your documents...",
  documents = [],
  selectedDocumentIds = [],
  onDocumentSelectionChange,
}, ref) => {
  const [message, setMessage] = useState("");
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useIsMobile();

  useImperativeHandle(ref, () => ({
    focus: () => {
      textareaRef.current?.focus();
    }
  }));

  const handleSubmit = () => {
    if (message.trim() && !disabled) {
      onSubmit(message.trim(), selectedDocumentIds);
      setMessage("");
      // Reset textarea height to minimum after submit
      if (textareaRef.current) {
        const minHeight = isMobile ? 44 : 48;
        textareaRef.current.style.height = `${minHeight}px`;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea with stable mobile behavior
  useEffect(() => {
    if (textareaRef.current) {
      // Reset height first
      textareaRef.current.style.height = "auto";
      
      // Calculate new height based on content
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = isMobile ? 120 : 192; // 120px for mobile, 192px for desktop
      const minHeight = isMobile ? 44 : 48; // Minimum height
      
      // Ensure we don't go below minimum or above maximum
      const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [message]); // Remove isMobile dependency to prevent flicker

  // Handle mobile viewport changes separately
  useEffect(() => {
    if (textareaRef.current && isMobile) {
      // Force recalculation when mobile state changes
      const event = new Event('input', { bubbles: true });
      textareaRef.current.dispatchEvent(event);
    }
  }, [isMobile]);

  // Handle document selection
  const handleDocumentSelectionChange = (documentIds: string[]) => {
    onDocumentSelectionChange?.(documentIds);
  };

  // Handle removing a specific document
  const handleRemoveDocument = (documentId: string) => {
    const newSelection = selectedDocumentIds.filter(id => id !== documentId);
    onDocumentSelectionChange?.(newSelection);
  };

  // Get selected documents for display
  const selectedDocuments = documents.filter(doc => selectedDocumentIds.includes(doc.id));

  return (
    <>
      <div className="w-full space-y-2">
        {/* Selected documents tags */}
        {selectedDocuments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {selectedDocuments.map((document) => (
              <Badge
                key={document.id}
                variant="secondary"
                className={cn(
                  "flex items-center gap-1.5 pl-2 pr-1 py-1",
                  "bg-primary/10 text-primary border border-primary/20",
                  "hover:bg-primary/15 transition-colors",
                  isMobile && "text-xs"
                )}
              >
                <FileText className="h-3 w-3 flex-shrink-0" />
                <span className="max-w-[120px] truncate">
                  {document.filename}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 hover:bg-primary/20 rounded-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveDocument(document.id);
                  }}
                  disabled={disabled}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className={cn(
          "flex items-end gap-2 w-full",
          isMobile && "gap-1.5" // Tighter spacing on mobile
        )}>
          {/* Document selection button */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsDocumentModalOpen(true)}
            disabled={disabled || documents.length === 0}
            className={cn(
              "flex-shrink-0 transition-all border-dashed",
              selectedDocumentIds.length > 0 && "border-primary text-primary",
              isMobile ? [
                "h-11 w-11", // Match textarea height on mobile
                "rounded-xl", // Match textarea
              ] : [
                "h-10 w-10",
                "rounded-lg",
                "mb-0.5"
              ]
            )}
            title={documents.length === 0 ? "No documents available" : "Select documents to focus search"}
          >
            <Plus className={cn(
              isMobile ? "h-5 w-5" : "h-4 w-4"
            )} />
            <span className="sr-only">Select documents</span>
          </Button>

          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedDocumentIds.length > 0 
                ? `Ask about ${selectedDocumentIds.length === 1 ? 'the selected document' : `${selectedDocumentIds.length} selected documents`}...`
                : placeholder
            }
            disabled={disabled}
            className={cn(
              "resize-none flex-1 text-base transition-all overflow-hidden",
              "focus-visible:ring-2 focus-visible:ring-ring",
              isMobile ? [
                "min-h-[2.75rem] max-h-[7.5rem]", // Mobile: 44px to 120px
                "text-[16px] leading-5", // Ensure 16px+ to prevent zoom on iOS
                "px-3 py-2.5", // Better touch targets
                "rounded-xl", // More rounded on mobile
                "touch-manipulation", // Optimize for touch
              ] : [
                "min-h-[3rem] max-h-48", // Desktop: 48px to 192px
                "px-3 py-3",
                "rounded-lg",
                "text-base",
              ],
              disabled && "opacity-50 cursor-not-allowed"
            )}
            data-testid="input-message"
            rows={1}
            // Mobile-specific attributes
            autoCapitalize={isMobile ? "sentences" : "off"}
            autoComplete="off"
            autoCorrect={isMobile ? "on" : "off"}
            spellCheck={isMobile}
          />
          <Button
            onClick={handleSubmit}
            disabled={disabled || !message.trim()}
            size="icon"
            className={cn(
              "flex-shrink-0 transition-all",
              isMobile ? [
                "h-11 w-11", // Larger touch target on mobile
                "rounded-xl", // Match textarea
                "mb-0"
              ] : [
                "h-10 w-10",
                "rounded-lg",
                "mb-0.5"
              ]
            )}
            data-testid="button-send"
          >
            <Send className={cn(
              isMobile ? "h-5 w-5" : "h-4 w-4"
            )} />
            <span className="sr-only">Send message</span>
          </Button>
        </div>
      </div>

      {/* Document Selection Modal */}
      <DocumentSelectionModal
        isOpen={isDocumentModalOpen}
        onClose={() => setIsDocumentModalOpen(false)}
        documents={documents}
        selectedDocumentIds={selectedDocumentIds}
        onSelectionChange={handleDocumentSelectionChange}
        mode="multi"
      />
    </>
  );
});

MessageInput.displayName = "MessageInput";
