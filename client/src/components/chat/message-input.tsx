import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageInputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageInput({
  onSubmit,
  disabled = false,
  placeholder = "Ask a question about your documents...",
}: MessageInputProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (message.trim() && !disabled) {
      onSubmit(message.trim());
      setMessage("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "min-h-[3rem] max-h-48 resize-none pr-12 text-base",
          "focus-visible:ring-2 focus-visible:ring-ring",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        data-testid="input-message"
        rows={1}
      />
      <Button
        onClick={handleSubmit}
        disabled={disabled || !message.trim()}
        size="icon"
        className="absolute bottom-2 right-2 h-8 w-8"
        data-testid="button-send"
      >
        <Send className="h-4 w-4" />
        <span className="sr-only">Send message</span>
      </Button>
    </div>
  );
}
