import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";

export type FeedbackCategory =
  | "ignored_instructions"
  | "fetched_multiple_documents"
  | "harmful_offensive"
  | "forgot_context"
  | "missing_information"
  | "other";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (category: FeedbackCategory, detailText: string) => Promise<void>;
}

const FEEDBACK_OPTIONS: { value: FeedbackCategory; label: string }[] = [
  {
    value: "ignored_instructions",
    label: "Ignored instructions",
  },
  {
    value: "fetched_multiple_documents",
    label: "Wrong documents fetched",
  },
  {
    value: "harmful_offensive",
    label: "Harmful or offensive",
  },
  {
    value: "forgot_context",
    label: "Forgot context",
  },
  {
    value: "missing_information",
    label: "Missing information",
  },
  {
    value: "other",
    label: "Other",
  },
];

export function FeedbackDialog({ open, onOpenChange, onSubmit }: FeedbackDialogProps) {
  const [selectedCategory, setSelectedCategory] = useState<FeedbackCategory | null>(null);
  const [detailText, setDetailText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useIsMobile();

  // Scroll textarea into view when focused on mobile
  useEffect(() => {
    if (!isMobile || !open) return;

    const handleFocus = () => {
      // Small delay to let keyboard appear
      setTimeout(() => {
        textareaRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 300);
    };

    const textarea = textareaRef.current;
    if (textarea) {
      textarea.addEventListener('focus', handleFocus);
      return () => textarea.removeEventListener('focus', handleFocus);
    }
  }, [isMobile, open]);

  const handleSubmit = async () => {
    if (!selectedCategory) return;

    setIsSubmitting(true);
    try {
      await onSubmit(selectedCategory, detailText.trim());
      setSubmitSuccess(true);
      
      // Close dialog after showing success
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (error) {
      console.error("Failed to submit feedback:", error);
      // Could show error toast here
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedCategory(null);
    setDetailText("");
    setSubmitSuccess(false);
    setIsSubmitting(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`
        ${isMobile 
          ? 'h-[100vh] w-[100vw] rounded-none max-h-none pb-[env(safe-area-inset-bottom)]' 
          : 'sm:max-w-[510px] max-h-[90vh] rounded-2xl'
        } 
        overflow-y-auto
      `}>
        <AnimatePresence mode="wait">
          {submitSuccess ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="flex flex-col items-center justify-center py-7 space-y-3.5"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 15 }}
                className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center"
              >
                <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400" />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
                className="text-center"
              >
                <h3 className="text-lg font-semibold text-foreground">Thanks for your feedback!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Helps us improve
                </p>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
            <DialogHeader className={isMobile ? "pb-2" : "pb-2.5"}>
              <DialogTitle className={`flex items-center gap-2.5 ${isMobile ? 'text-base' : 'text-lg'}`}>
                <AlertCircle className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'} text-amber-500`} />
                What went wrong?
              </DialogTitle>
              <DialogDescription className={isMobile ? "text-xs" : ""}>
                {isMobile 
                  ? "Let us know what went wrong with this response" 
                  : "Help us improve by letting us know what went wrong with this response."
                }
              </DialogDescription>
            </DialogHeader>

            <div className={`${isMobile ? 'space-y-3.5' : 'space-y-5'} py-2.5`}>
              {/* Category Selection - Compact Grid */}
              <RadioGroup
                value={selectedCategory || ""}
                onValueChange={(value) => setSelectedCategory(value as FeedbackCategory)}
                className={`grid grid-cols-2 ${isMobile ? 'gap-2' : 'gap-2.5'}`}
              >
                {FEEDBACK_OPTIONS.map((option) => (
                  <motion.div
                    key={option.value}
                    className={cn(
                      "flex items-center space-x-2.5 p-3 rounded-lg border-2 transition-all duration-200 cursor-pointer",
                      selectedCategory === option.value
                        ? "bg-primary/10 border-primary shadow-sm scale-[1.02]"
                        : "bg-muted/20 border-border/50 hover:bg-muted/40 hover:border-border hover:shadow-sm"
                    )}
                    onClick={() => setSelectedCategory(option.value)}
                    whileTap={{ scale: 0.98 }}
                  >
                    <RadioGroupItem 
                      value={option.value} 
                      id={option.value} 
                      className={`shrink-0 border-2 self-center ${isMobile ? 'h-4 w-4' : ''}`}
                    />
                    <Label
                      htmlFor={option.value}
                      className={`${isMobile ? 'text-xs' : 'text-sm'} font-medium leading-tight cursor-pointer flex-1 self-center`}
                    >
                      {option.label}
                    </Label>
                  </motion.div>
                ))}
              </RadioGroup>

              {/* Detail Text Input - Compact */}
              <div className={isMobile ? "space-y-1.5" : "space-y-2"}>
                <Label htmlFor="detail-text" className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground`}>
                  {isMobile ? "Details (optional)" : "Additional details (optional)"}
                </Label>
                <Textarea
                  ref={textareaRef}
                  id="detail-text"
                  placeholder={isMobile ? "What happened?" : "Describe what happened..."}
                  value={detailText}
                  onChange={(e) => setDetailText(e.target.value)}
                  className={`${isMobile ? 'min-h-[100px] text-[16px]' : 'min-h-[85px] text-sm'} resize-none`}
                  maxLength={500}
                  disabled={selectedCategory !== "other"}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {detailText.length}/500
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className={`flex ${isMobile ? 'flex-col' : 'justify-end'} gap-2.5 pt-2.5`}>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleClose} 
                disabled={isSubmitting}
                className={`${isMobile ? 'w-full h-10' : 'h-9 px-4'} text-sm`}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!selectedCategory || isSubmitting}
                className={`${isMobile ? 'w-full h-10' : 'h-9 px-5'} text-sm`}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Sending...</span>
                  </span>
                ) : (
                  "Submit"
                )}
              </Button>
            </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
