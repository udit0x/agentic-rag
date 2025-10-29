import { type Message } from "@shared/schema";
import { cn } from "@/lib/utils";
import { User, Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MessageBubbleProps {
  message: Message;
  onCitationClick?: (sourceIndex: number) => void;
}

export function MessageBubble({ message, onCitationClick }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex gap-3 animate-in fade-in-0 duration-200",
        isUser ? "justify-end" : "justify-start"
      )}
      data-testid={`message-${message.role}`}
    >
      {!isUser && (
        <div className="flex-shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Bot className="h-4 w-4" />
          </div>
        </div>
      )}

      <div
        className={cn(
          "flex flex-col gap-1",
          isUser ? "items-end max-w-2xl" : "items-start flex-1 max-w-full"
        )}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground" data-testid={`text-sender-${message.role}`}>
            {isUser ? "You" : "Assistant"}
          </span>
          <span className="text-xs text-muted-foreground" data-testid="text-timestamp">
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            isUser
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-card border border-card-border"
          )}
          data-testid="message-content"
        >
          {isUser ? (
            <p className="text-base leading-relaxed whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, "")}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={cn("font-mono text-sm", className)} {...props}>
                        {children}
                      </code>
                    );
                  },
                  a({ children, href, ...props }) {
                    const citationMatch = href?.match(/^#citation-(\d+)$/);
                    if (citationMatch) {
                      const index = parseInt(citationMatch[1], 10);
                      return (
                        <button
                          onClick={() => onCitationClick?.(index)}
                          className="inline-flex items-center align-super text-xs font-medium text-primary hover:underline"
                          data-testid={`link-citation-${index}`}
                          {...props}
                        >
                          [{index + 1}]
                        </button>
                      );
                    }
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                        {...props}
                      >
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {message.sources.map((source, index) => (
              <button
                key={index}
                onClick={() => onCitationClick?.(index)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors font-mono"
                data-testid={`button-source-${index}`}
              >
                [{index + 1}] {source.filename}
              </button>
            ))}
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <User className="h-4 w-4" />
          </div>
        </div>
      )}
    </div>
  );
}
