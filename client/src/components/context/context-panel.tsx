import { type Message, type QueryClassification, type AgentTrace } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, ExternalLink, Zap, Clock, BarChart3, Search, Brain, AlertCircle, GitBranch, Sparkles, Lightbulb, ChevronRight, ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

interface ContextPanelProps {
  sources?: Message["sources"];
  selectedSourceIndex?: number;
  classification?: QueryClassification;
  agentTraces?: AgentTrace[];
  executionTimeMs?: number;
  responseType?: string;
  enableTracing?: boolean;
  isVisible?: boolean;
  onToggleVisibility?: () => void;
}

function getClassificationIcon(type: string) {
  switch (type) {
    case "factual":
      return <Search className="h-4 w-4" />;
    case "counterfactual":
      return <BarChart3 className="h-4 w-4" />;
    case "temporal":
      return <Clock className="h-4 w-4" />;
    case "general":
      return <Brain className="h-4 w-4" />;
    default:
      return <Brain className="h-4 w-4" />;
  }
}

function getClassificationColor(type: string) {
  switch (type) {
    case "factual":
      return "bg-blue-500/10 text-blue-700 border-blue-500/20";
    case "counterfactual":
      return "bg-purple-500/10 text-purple-700 border-purple-500/20";
    case "temporal":
      return "bg-orange-500/10 text-orange-700 border-orange-500/20";
    case "general":
      return "bg-green-500/10 text-green-700 border-green-500/20";
    default:
      return "bg-gray-500/10 text-gray-700 border-gray-500/20";
  }
}

function getAgentIcon(agentName: string) {
  switch (agentName) {
    case "router":
      return <GitBranch className="h-4 w-4" />;
    case "retriever":
      return <Search className="h-4 w-4" />;
    case "query_refinement":
      return <Sparkles className="h-4 w-4" />;
    case "reasoning":
      return <Lightbulb className="h-4 w-4" />;
    case "simulation":
      return <BarChart3 className="h-4 w-4" />;
    case "temporal":
      return <Clock className="h-4 w-4" />;
    case "general_knowledge":
      return <Brain className="h-4 w-4" />;
    default:
      return <Brain className="h-4 w-4" />;
  }
}

export function ContextPanel({ 
  sources, 
  selectedSourceIndex, 
  classification,
  agentTraces,
  executionTimeMs,
  responseType,
  enableTracing = false,
  isVisible = true,
  onToggleVisibility
}: ContextPanelProps) {
  const [accordionValue, setAccordionValue] = useState<string | undefined>();
  const hasTraces = enableTracing && agentTraces && agentTraces.length > 0;
  const hasClassification = classification && classification.type;

  // Update accordion when selectedSourceIndex changes
  useEffect(() => {
    if (selectedSourceIndex !== undefined && sources && Array.isArray(sources) && sources.length > 0) {
      // Create the grouped sources to find which document contains the selected source
      const sourcesWithIndex = sources.map((source: any, index: number) => ({ ...source, originalIndex: index }));
      const groupedSources = sourcesWithIndex.reduce((acc: any, source: any) => {
        const filename = source.metadata?.filename || source.filename || "Unknown Document";
        if (!acc[filename]) acc[filename] = [];
        acc[filename].push(source);
        return acc;
      }, {});

      // Find the document that contains the selected source
      const targetDocument = Object.keys(groupedSources).find(filename => 
        (groupedSources[filename] as any[]).some((s: any) => s.originalIndex === selectedSourceIndex)
      );

      if (targetDocument) {
        setAccordionValue(`doc-${targetDocument}`);
      }
    }
  }, [selectedSourceIndex, sources]);

  // If panel is hidden, show only the toggle button
  if (!isVisible) {
    return (
      <div className="relative h-full">
        <Button
          variant="outline"
          size="icon"
          className="absolute left-0 top-4 z-10 rounded-r-md rounded-l-none shadow-md"
          onClick={onToggleVisibility}
          title="Show context panel"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Show empty state when panel is visible but no content
  const hasContent = sources?.length || hasTraces || hasClassification;

  return (
    <div className="flex flex-col h-full w-full max-w-full overflow-hidden">
      <div className="flex-shrink-0 p-4 border-b border-border overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground truncate max-w-full" data-testid="text-context-header">
            Context & Analysis
          </h2>
          {onToggleVisibility && (
            <Button
              variant="ghost"
              size="icon"
              className="flex-shrink-0 h-8 w-8"
              onClick={onToggleVisibility}
              title="Hide context panel"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {hasClassification && (
            <Badge className={getClassificationColor(classification.type)}>
              {getClassificationIcon(classification.type)}
              <span className="ml-1 capitalize">{classification.type}</span>
            </Badge>
          )}
          {executionTimeMs && (
            <Badge variant="outline" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              {(executionTimeMs / 1000).toFixed(2)}s
            </Badge>
          )}
        </div>
      </div>

      {!hasContent ? (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-muted mb-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No context yet</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Ask a question to see relevant sources and agent activity
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 w-full">
        <Tabs defaultValue="sources" className="h-full flex flex-col">
          <div className="flex-shrink-0 px-4 pt-4">
            <TabsList className="grid grid-cols-2 w-full max-w-full">
              <TabsTrigger value="sources" className="text-sm truncate">
                Sources ({sources && Array.isArray(sources) ? new Set(sources.map((s: any) => s.filename)).size : 0})
              </TabsTrigger>
              <TabsTrigger value="agents" className="text-sm truncate">
                Agents ({agentTraces?.length || 0})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="sources" className="flex-1 min-h-0">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-3">
                {!sources || sources.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No sources retrieved</p>
                  </div>
                ) : (
                  (() => {
                    // Ensure sources is an array
                    const sourcesArray = Array.isArray(sources) ? sources : [];
                    
                    // Group sources by filename
                    const groupedSources = sourcesArray.reduce((acc: Record<string, any[]>, source: any, index: number) => {
                      const filename = source.filename;
                      if (!acc[filename]) {
                        acc[filename] = [];
                      }
                      acc[filename].push({ ...source, originalIndex: index });
                      return acc;
                    }, {});

                    const documentGroups = Object.entries(groupedSources);

                    return (
                      <Accordion
                        type="single"
                        collapsible
                        value={accordionValue}
                        onValueChange={setAccordionValue}
                        className="w-full"
                      >
                        {documentGroups.map(([filename, documentSources], docIndex) => {
                          // Sort sources by relevance score (highest first)
                          const sortedSources = [...(documentSources as any[])].sort((a: any, b: any) => 
                            (b.score || 0) - (a.score || 0)
                          );
                          const highestScore = sortedSources[0]?.score || 0;
                          const chunkCount = (documentSources as any[]).length;
                          
                          return (
                            <AccordionItem
                              key={filename}
                              value={`doc-${filename}`}
                              className={`w-full ${(documentSources as any[]).some((s: any) => s.originalIndex === selectedSourceIndex) ? "border-primary" : ""}`}
                            >
                              <AccordionTrigger
                                className="hover:no-underline text-left w-full"
                                data-testid={`accordion-document-${docIndex}`}
                              >
                                <div className="flex items-center gap-3 text-left pr-2 w-full min-w-0">
                                  <Badge variant="outline" className="flex-shrink-0">
                                    Source {docIndex + 1}
                                  </Badge>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate" data-testid="text-source-filename" title={filename}>
                                      {filename.length > 35 ? `${filename.substring(0, 32)}...` : filename}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <span>Relevance: {(highestScore * 100).toFixed(1)}%</span>
                                      <span>•</span>
                                      <span>{chunkCount} chunk{chunkCount > 1 ? 's' : ''}</span>
                                    </div>
                                  </div>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="w-full">
                                <div className="space-y-3 w-full">
                                  {sortedSources.map((source, chunkIndex) => (
                                    <Card key={source.chunkId} className="p-3 bg-muted/30 w-full">
                                      <div className="flex items-start gap-2 mb-2 w-full">
                                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0 w-full">
                                          <div className="flex items-center justify-between mb-1 gap-2">
                                            <p className="text-xs font-medium text-muted-foreground">
                                              Excerpt {chunkIndex + 1}:
                                            </p>
                                            <Badge variant="secondary" className="text-xs flex-shrink-0">
                                              {((source.score || 0) * 100).toFixed(1)}% relevance
                                            </Badge>
                                          </div>
                                          <p className="text-sm text-foreground leading-relaxed break-words">
                                            {source.excerpt}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border gap-2">
                                        <p className="text-xs text-muted-foreground font-mono">
                                          Relevance: {((source.score || 0) * 100).toFixed(1)}%
                                        </p>
                                        {/* <button
                                          className="text-xs text-primary hover:underline flex items-center gap-1 flex-shrink-0"
                                          data-testid="link-view-document"
                                        >
                                          View document
                                          <ExternalLink className="h-3 w-3" />
                                        </button> */}
                                      </div>
                                    </Card>
                                  ))}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    );
                  })()
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="agents" className="flex-1 min-h-0">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-3">
                {!hasTraces ? (
                  <div className="text-center py-8 px-4">
                    <Brain className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground mb-2">
                      {enableTracing ? "No agent traces available" : "Enable tracing to see agent activity"}
                    </p>
                    {enableTracing && (
                      <p className="text-xs text-muted-foreground/80 max-w-xs mx-auto">
                        Agent activity is shown only for the most recent query. Switching between chat/history tabs will clear this view.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 w-full">
                    {/* Query Classification */}
                    {hasClassification && (
                      <Card className="p-4 w-full">
                        <div className="flex items-center gap-2 mb-2">
                          {getClassificationIcon(classification.type)}
                          <h3 className="text-sm font-semibold">Query Classification</h3>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Type:</span>
                            <Badge className={getClassificationColor(classification.type)}>
                              {classification.type}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Confidence:</span>
                            <span>{(classification.confidence * 100).toFixed(1)}%</span>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-1">Reasoning:</p>
                            <p className="text-xs bg-muted/50 p-2 rounded break-words">{classification.reasoning}</p>
                          </div>
                          {classification.keywords.length > 0 && (
                            <div>
                              <p className="text-muted-foreground mb-1">Keywords:</p>
                              <div className="flex flex-wrap gap-1">
                                {classification.keywords.map((keyword, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">
                                    {keyword}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </Card>
                    )}

                    {/* Agent Execution Traces */}
                    <div className="space-y-2 w-full">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Agent Execution Timeline
                      </h3>
                      {agentTraces.map((trace, index) => (
                        <Card key={index} className="p-3 w-full">
                          <div className="flex items-center justify-between mb-2 gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {getAgentIcon(trace.agentName)}
                              <span className="text-sm font-medium capitalize truncate">
                                {trace.agentName} Agent
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                              {trace.error && (
                                <AlertCircle className="h-3 w-3 text-red-500" />
                              )}
                              {trace.durationMs && (
                                <Badge variant="outline" className="text-xs">
                                  {trace.durationMs}ms
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          {trace.error ? (
                            <div className="text-xs text-red-600 bg-red-50 p-2 rounded break-words">
                              Error: {trace.error}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">
                              <div className="flex justify-between gap-2">
                                <span>Started:</span>
                                <span className="flex-shrink-0">{new Date(trace.startTime).toLocaleTimeString()}</span>
                              </div>
                              {trace.outputData ? (
                                <div className="mt-1 p-2 bg-muted/30 rounded overflow-hidden">
                                  <pre className="text-xs overflow-x-auto break-words whitespace-pre-wrap">
                                    {typeof trace.outputData === 'string' ? trace.outputData : JSON.stringify(trace.outputData, null, 2)}
                                  </pre>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
        </div>
      )}
    </div>
  );
}
