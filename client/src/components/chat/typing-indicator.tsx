import { Bot } from "lucide-react";

export function TypingIndicator() {
  return (
    <div className="flex gap-3 animate-in fade-in-0 duration-200" data-testid="typing-indicator">
      <div className="flex-shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Bot className="h-4 w-4" />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Assistant</span>

        <div className="rounded-2xl bg-card border border-card-border px-4 py-3">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
            <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
            <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" />
          </div>
        </div>
      </div>
    </div>
  );
}
