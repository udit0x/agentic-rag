import { type Message } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FileText, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ContextPanelProps {
  sources?: Message["sources"];
  selectedSourceIndex?: number;
}

export function ContextPanel({ sources, selectedSourceIndex }: ContextPanelProps) {
  if (!sources || sources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="flex items-center justify-center h-16 w-16 rounded-full bg-muted mb-4">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No sources yet</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Ask a question to see relevant document sources and citations
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-6 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground" data-testid="text-context-header">
          Context Sources
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {sources.length} {sources.length === 1 ? "source" : "sources"} retrieved
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-3">
          <Accordion
            type="single"
            collapsible
            defaultValue={selectedSourceIndex !== undefined ? `item-${selectedSourceIndex}` : undefined}
          >
            {sources.map((source, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className={selectedSourceIndex === index ? "border-primary" : ""}
              >
                <AccordionTrigger
                  className="hover:no-underline"
                  data-testid={`accordion-source-${index}`}
                >
                  <div className="flex items-center gap-3 text-left pr-2">
                    <Badge variant="outline" className="flex-shrink-0">
                      [{index + 1}]
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" data-testid="text-source-filename">
                        {source.filename}
                      </p>
                      {source.score !== undefined && (
                        <p className="text-xs text-muted-foreground">
                          Relevance: {(source.score * 100).toFixed(1)}%
                        </p>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <Card className="p-3 bg-muted/30">
                    <div className="flex items-start gap-2 mb-2">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Excerpt:
                        </p>
                        <p className="text-sm text-foreground leading-relaxed">
                          {source.excerpt}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                      <p className="text-xs text-muted-foreground font-mono">
                        Chunk ID: {source.chunkId.substring(0, 8)}...
                      </p>
                      <button
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                        data-testid="link-view-document"
                      >
                        View document
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>
                  </Card>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </ScrollArea>
    </div>
  );
}
