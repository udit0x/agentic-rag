import { type Message } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { User, Bot, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

interface MessageBubbleProps {
  message: Message;
  responseType?: string;
  onCitationClick?: (sourceIndex: number, messageSources: Message["sources"]) => void;
  refinedQueries?: string[];
  showRefinedQueries?: boolean;
  onRefinedQueryClick?: (query: string) => void;
}

interface CodeBlockProps {
  language: string;
  children: string;
}

function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors opacity-0 group-hover:opacity-100"
        title="Copy code"
      >
        {copied ? (
          <>
            <Check className="h-3 w-3" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" />
            Copy
          </>
        )}
      </button>
      <SyntaxHighlighter
        style={oneDark as any}
        language={language}
        PreTag="div"
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

export function MessageBubble({ 
  message, 
  responseType, 
  onCitationClick, 
  refinedQueries, 
  showRefinedQueries = false,
  onRefinedQueryClick 
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isMobile = useIsMobile();
  const [isQuestionsExpanded, setIsQuestionsExpanded] = useState(false);
  const [showQuestions, setShowQuestions] = useState(showRefinedQueries);

  // Auto-show questions when they become available, then auto-hide after delay
  useEffect(() => {
    if (refinedQueries && refinedQueries.length > 0 && showRefinedQueries) {
      setShowQuestions(true);
      
      // Auto-hide after 4 seconds and collapse
      const timer = setTimeout(() => {
        setShowQuestions(false);
        setIsQuestionsExpanded(false);
      }, 4000);
      
      return () => clearTimeout(timer);
    }
  }, [refinedQueries, showRefinedQueries]);

  const hasRefinedQueries = refinedQueries && refinedQueries.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "flex",
        isMobile ? "gap-2" : "gap-3", // Tighter spacing on mobile
        isUser ? "justify-end" : "justify-start"
      )}
      data-testid={`message-${message.role}`}
    >
      {!isUser && (
        <div className="flex-shrink-0">
          <div className={cn(
            "flex items-center justify-center rounded-full bg-primary text-primary-foreground",
            isMobile ? "h-7 w-7" : "h-8 w-8" // Smaller avatar on mobile
          )}>
            <Bot className={cn(isMobile ? "h-3.5 w-3.5" : "h-4 w-4")} />
          </div>
        </div>
      )}

      <div
        className={cn(
          "flex flex-col gap-1",
          isUser ? [
            "items-end", 
            isMobile ? "max-w-[85%]" : "max-w-2xl" // Wider on mobile for better use of space
          ] : [
            "items-start flex-1", 
            isMobile ? "max-w-[85%]" : "max-w-full"
          ]
        )}
      >
        <div className="flex items-center gap-2">
          <span className={cn(
            "font-medium text-foreground",
            isMobile ? "text-xs" : "text-sm" // Smaller text on mobile
          )} data-testid={`text-sender-${message.role}`}>
            {isUser ? "You" : "Assistant"}
          </span>
          {!isUser && responseType === "general_knowledge" && (
            <span className={cn(
              "px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800",
              isMobile ? "text-[10px]" : "text-xs" // Even smaller badge on mobile
            )}>
              General AI Knowledge
            </span>
          )}
          <span className={cn(
            "text-muted-foreground",
            isMobile ? "text-[10px]" : "text-xs"
          )} data-testid="text-timestamp">
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        <div
          className={cn(
            "rounded-2xl",
            isMobile ? "px-3 py-2.5 text-sm" : "px-4 py-3 text-base", // Smaller padding and text on mobile
            isUser
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-card border border-card-border"
          )}
          data-testid="message-content"
        >
          {isUser ? (
            <p className={cn(
              "leading-relaxed whitespace-pre-wrap",
              isMobile ? "text-sm" : "text-base"
            )}>{message.content}</p>
          ) : (
            <div className={cn(
              "prose dark:prose-invert max-w-none",
              isMobile ? "prose-sm" : "prose-sm"
            )}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "");
                    const isInline = !props.node?.position?.start?.column;
                    const codeContent = String(children).replace(/\n$/, "");
                    
                    return !isInline && match ? (
                      <CodeBlock language={match[1]}>
                        {codeContent}
                      </CodeBlock>
                    ) : (
                      <code className={cn(
                        "font-mono",
                        isMobile ? "text-xs" : "text-sm",
                        className
                      )} {...props}>
                        {children}
                      </code>
                    );
                  },
                  a({ children, href, ...props }: any) {
                    const citationMatch = href?.match(/^#citation-(\d+)$/);
                    if (citationMatch) {
                      const index = parseInt(citationMatch[1], 10);
                      return (
                        <button
                          onClick={() => onCitationClick?.(index, message.sources)}
                          className={cn(
                            "inline-flex items-center align-super font-medium text-primary hover:underline",
                            isMobile ? "text-[10px]" : "text-xs"
                          )}
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

        {/* Refined Questions Section - Only for user messages */}
        {isUser && hasRefinedQueries && (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ 
                opacity: showQuestions ? 1 : 0.7, 
                height: "auto" 
              }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="mt-2"
            >
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                {/* Header with toggle */}
                <button
                  onClick={() => setIsQuestionsExpanded(!isQuestionsExpanded)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    Related Questions ({refinedQueries.length})
                  </span>
                  {isQuestionsExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                
                {/* Questions List */}
                <AnimatePresence>
                  {(isQuestionsExpanded || showQuestions) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-gray-200 dark:border-gray-700"
                    >
                      <div className="p-3 space-y-2">
                        {/* Explanation text - only shown when expanded */}
                        {isQuestionsExpanded && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 italic mb-3">
                            Related questions generated for better search accuracy and context understanding
                          </div>
                        )}
                        {refinedQueries.map((query, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="text-sm text-gray-600 dark:text-gray-300 py-1"
                          >
                            <span className="text-blue-500 font-medium">{index + 1}.</span> {query}
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {!isUser && (
          (message.sources && message.sources.length > 0) ? (
            <div className={cn("mt-3", isMobile && "mt-2")}>
              <div className="flex items-center gap-2 mb-3">
                <span className={cn(
                  "font-medium text-muted-foreground uppercase tracking-wide",
                  isMobile ? "text-[10px]" : "text-xs"
                )}>
                  Sources
                </span>
                <div className="h-px bg-border flex-1" />
              </div>
              <div className={cn(
                "grid gap-2",
                isMobile ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
              )}>
                {(() => {
                  // Ensure sources is an array
                  const sourcesArray = Array.isArray(message.sources) ? message.sources : [];
                  
                  // Group sources by filename and collect citation numbers
                  const sourceGroups = sourcesArray.reduce((acc, source, index) => {
                    const filename = source.filename;
                    if (!acc[filename]) {
                      acc[filename] = {
                        source: source,
                        citations: []
                      };
                    }
                    acc[filename].citations.push(index + 1);
                    return acc;
                  }, {} as Record<string, { source: any, citations: number[] }>);

                  return Object.entries(sourceGroups).map(([filename, data]) => {
                    // Trim filename if too long (keep first part + extension)
                    const maxLength = isMobile ? 20 : 25;
                    const trimmedFilename = filename.length > maxLength 
                      ? filename.substring(0, maxLength - 5) + "..." + filename.substring(filename.lastIndexOf('.'))
                      : filename;
                    
                    return (
                      <button
                        key={filename}
                        onClick={() => onCitationClick?.(data.citations[0] - 1, message.sources)}
                        className={cn(
                          "group flex items-center gap-2 bg-background border border-border hover:border-primary/50 rounded-lg transition-all hover:shadow-sm",
                          isMobile ? "px-2.5 py-2 text-xs" : "px-3 py-2"
                        )}
                        title={`${filename} - Score: ${(data.source.score * 100).toFixed(0)}%`}
                        data-testid={`button-source-${filename}`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className={cn(
                            "flex-shrink-0 bg-primary/60 rounded-full group-hover:bg-primary",
                            isMobile ? "w-1.5 h-1.5" : "w-2 h-2"
                          )}></div>
                          <span className={cn(
                            "font-medium text-foreground truncate",
                            isMobile ? "text-xs" : "text-xs"
                          )}>
                            {trimmedFilename}
                          </span>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {data.citations.map((num) => (
                            <span
                              key={num}
                              className={cn(
                                "inline-flex items-center justify-center font-medium text-primary bg-primary/10 border border-primary/20 rounded",
                                isMobile ? "w-4 h-4 text-[10px]" : "w-5 h-5 text-xs"
                              )}
                            >
                              {num}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
          ) : responseType === "general_knowledge" && (
            <div className={cn("mt-3", isMobile && "mt-2")}>
              <div className="flex items-center gap-2 mb-3">
                <span className={cn(
                  "font-medium text-muted-foreground uppercase tracking-wide",
                  isMobile ? "text-[10px]" : "text-xs"
                )}>
                  Source
                </span>
                <div className="h-px bg-border flex-1" />
              </div>
              <div className={cn(
                "flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg",
                isMobile ? "px-2.5 py-2" : "px-3 py-2"
              )}>
                <div className={cn(
                  "flex-shrink-0 bg-blue-500 rounded-full",
                  isMobile ? "w-1.5 h-1.5" : "w-2 h-2"
                )} />
                <span className={cn(
                  "font-medium text-blue-700 dark:text-blue-300",
                  isMobile ? "text-xs" : "text-xs"
                )}>
                  General AI Knowledge
                </span>
              </div>
            </div>
          )
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0">
          <div className={cn(
            "flex items-center justify-center rounded-full bg-muted text-muted-foreground",
            isMobile ? "h-7 w-7" : "h-8 w-8"
          )}>
            <User className={cn(isMobile ? "h-3.5 w-3.5" : "h-4 w-4")} />
          </div>
        </div>
      )}
    </motion.div>
  );
}