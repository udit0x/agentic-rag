import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, Plus, X, FileText } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { useUploadContext } from "@/contexts/upload-context";
import { useQuotaStore } from "@/stores/quota-store";
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
  onQuotaExhausted?: () => void; // Callback when quota is 0
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
  onQuotaExhausted,
}, ref) => {
  const [message, setMessage] = useState("");
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { hasActiveUploads } = useUploadContext();
  
  // Quota management
  const { quotaRemaining, isUnlimited, hasPersonalKey, getQuotaStatus } = useQuotaStore();
  const quotaStatus = getQuotaStatus();
  const isQuotaExhausted = !isUnlimited && !hasPersonalKey && quotaRemaining <= 0;
  
  // Toast thresholds for quota warnings
  const QUOTA_TOAST_THRESHOLDS = [30, 10, 5, 4, 3, 2, 1, 0];
  const prevQuotaRef = useRef<number>(quotaRemaining);
  
  const MAX_CHARACTERS = 2000;
  const isNearLimit = message.length > MAX_CHARACTERS * 0.9; // Show warning at 90%
  const isOverLimit = message.length > MAX_CHARACTERS;

  // Combine disabled states
  const isInputDisabled = disabled || hasActiveUploads || isQuotaExhausted;

  useImperativeHandle(ref, () => ({
    focus: () => {
      textareaRef.current?.focus();
    }
  }));

  const handleSubmit = () => {
    if (hasActiveUploads) {
      toast({
        title: "Upload in progress",
        description: "Please wait until the current upload finishes before sending a message.",
        variant: "default",
      });
      return;
    }
    
    // Check quota before submitting
    if (isQuotaExhausted) {
      onQuotaExhausted?.();
      return;
    }
    
    if (message.trim() && !disabled && !isOverLimit) {
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
  }, [message, isMobile]); // Remove isMobile dependency to prevent flicker

  // Handle mobile viewport changes separately
  useEffect(() => {
    if (textareaRef.current && isMobile) {
      // Force recalculation when mobile state changes
      const event = new Event('input', { bubbles: true });
      textareaRef.current.dispatchEvent(event);
    }
  }, [isMobile]);

  // Show toast at quota thresholds
  useEffect(() => {
    // Skip if unlimited or has personal key
    if (isUnlimited || hasPersonalKey) return;
    
    // Check if quota decreased and hit a threshold
    if (quotaRemaining < prevQuotaRef.current && QUOTA_TOAST_THRESHOLDS.includes(quotaRemaining)) {
      if (quotaRemaining === 0) {
        toast({
          title: "No messages remaining",
          description: "Add your API key to continue chatting.",
          variant: "destructive",
        });
      } else if (quotaRemaining <= 5) {
        toast({
          title: `${quotaRemaining} ${quotaRemaining === 1 ? 'message' : 'messages'} remaining`,
          description: "You're running low on messages!",
          variant: "destructive",
        });
      } else {
        toast({
          title: `${quotaRemaining} messages remaining`,
          description: "Consider adding your API key for unlimited messages.",
        });
      }
    }
    
    prevQuotaRef.current = quotaRemaining;
  }, [quotaRemaining, isUnlimited, hasPersonalKey, toast]);

  // Handle document selection
  const handleDocumentSelectionChange = (documentIds: string[]) => {
    onDocumentSelectionChange?.(documentIds);
  };

  // Handle removing a specific document
  const handleRemoveDocument = (documentId: string) => {
    const newSelection = selectedDocumentIds.filter(id => id !== documentId);
    onDocumentSelectionChange?.(newSelection);
  };

  // Show toast when user tries to interact with disabled input due to upload
  const handleInputInteraction = () => {
    if (hasActiveUploads && !disabled) {
      toast({
        title: "Upload in progress",
        description: "Please wait until the current upload finishes before sending a message.",
        variant: "default",
      });
    } else if (isQuotaExhausted) {
      onQuotaExhausted?.();
    }
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
                  disabled={isInputDisabled}
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
            onClick={() => {
              if (hasActiveUploads && !disabled) {
                handleInputInteraction();
              } else {
                setIsDocumentModalOpen(true);
              }
            }}
            disabled={isInputDisabled || documents.length === 0}
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

          {/* Textarea with character counter overlay */}
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={handleInputInteraction}
              onClick={handleInputInteraction}
              placeholder={
                hasActiveUploads 
                  ? "Upload in progress, please wait..."
                  : isQuotaExhausted
                    ? "Quota exhausted - Add API key to continue..."
                    : selectedDocumentIds.length > 0 
                      ? `Ask about ${selectedDocumentIds.length === 1 ? 'the selected document' : `${selectedDocumentIds.length} selected documents`}...`
                      : placeholder
              }
              disabled={isInputDisabled}
              maxLength={MAX_CHARACTERS}
              className={cn(
                "resize-none w-full text-base transition-all overflow-y-auto",
                "focus-visible:ring-2 focus-visible:ring-ring",
                "[&::-webkit-scrollbar]:w-2",
                "[&::-webkit-scrollbar-track]:bg-transparent",
                "[&::-webkit-scrollbar-thumb]:bg-gray-400 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-0",
                "[&::-webkit-scrollbar-thumb]:hover:bg-gray-500",
                "dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 dark:[&::-webkit-scrollbar-thumb]:hover:bg-gray-500",
                isOverLimit && "ring-2 ring-destructive focus-visible:ring-destructive",
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
                isInputDisabled && "opacity-50 cursor-not-allowed"
              )}
              data-testid="input-message"
              rows={1}
              // Mobile-specific attributes
              autoCapitalize={isMobile ? "sentences" : "off"}
              autoComplete="off"
              autoCorrect={isMobile ? "on" : "off"}
              spellCheck={isMobile}
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={isInputDisabled || !message.trim() || isOverLimit}
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
        
        {/* Character limit warning - minimal warning below input */}
        {message.length >= MAX_CHARACTERS && (
          <div className="text-[10px] text-right text-red-600 dark:text-red-500 font-bold animate-in fade-in duration-200">
            Character limit reached ({MAX_CHARACTERS})
          </div>
        )}
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
