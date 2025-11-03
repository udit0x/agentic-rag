import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Message, type QueryResponse, type QueryClassification, type AgentTrace } from "@shared/schema";
import { Header } from "@/components/layout/header";
import { MessageBubble } from "@/components/chat/message-bubble";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { MessageInput } from "@/components/chat/message-input";
import { EmptyState } from "@/components/chat/empty-state";
import { ContextPanel } from "@/components/context/context-panel";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { Settings, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Chat() {
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number | undefined>();
  const [currentSources, setCurrentSources] = useState<Message["sources"]>();
  const [currentClassification, setCurrentClassification] = useState<QueryClassification | undefined>();
  const [currentAgentTraces, setCurrentAgentTraces] = useState<AgentTrace[] | undefined>();
  const [currentExecutionTime, setCurrentExecutionTime] = useState<number | undefined>();
  const [currentResponseType, setCurrentResponseType] = useState<string | undefined>();
  const [enableTracing, setEnableTracing] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [refinedQueries, setRefinedQueries] = useState<string[]>([]);
  const [showRefinedQueries, setShowRefinedQueries] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [uploadedDocuments, setUploadedDocuments] = useState<Array<{
    id: string;
    filename: string;
    size: number;
    uploadedAt: string;
  }>>([]);
  const [settings, setSettings] = useState({
    enableTracing: true,
    debugMode: false,
    temperature: 0.7,
    maxTokens: 2000,
    model: "gpt-4o",
    theme: "system" as "light" | "dark" | "system",
    enableAnimations: true,
    enableKeyboardShortcuts: true,
    useGeneralKnowledge: true, // Default to true (enabled)
    documentRelevanceThreshold: 0.65, // Default threshold (60%)
    // LLM Configuration - defaults from environment
    llmProvider: "azure" as "openai" | "azure",
    openaiApiKey: "",
    openaiModel: "gpt-4o",
    azureApiKey: "", // Will be loaded from backend
    azureEndpoint: "", // Will be loaded from backend
    azureDeploymentName: "gpt-4o", // Will be loaded from backend
    geminiApiKey: "",
    geminiModel: "gemini-1.5-pro",
    // Embeddings Configuration - defaults from environment
    embeddingProvider: "azure" as "openai" | "azure",
    embeddingApiKey: "", // Will be loaded from backend
    embeddingEndpoint: "", // Will be loaded from backend
    embeddingModel: "text-embedding-3-large", // Will be loaded from backend
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<{ focus: () => void }>(null);
  const { toast } = useToast();

  const { data: chatHistory, isLoading: isLoadingHistory } = useQuery<{ messages: Message[] }>({
    queryKey: ["/api/chat", sessionId],
    enabled: !!sessionId,
  });

  // Query to fetch uploaded documents
  const { data: documentsData, refetch: refetchDocuments } = useQuery<Array<{
    id: string;
    filename: string;
    size: number;
    uploadedAt: string;
  }>>({
    queryKey: ["/api/documents"],
    queryFn: async () => {
      console.log('[DEBUG] Fetching documents from API...');
      const data = await apiRequest<Array<{
        id: string;
        filename: string;
        size: number;
        uploadedAt: string;
      }>>("/api/documents");
      console.log('[DEBUG] Documents fetched:', data);
      return data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      // This is no longer used directly - uploads are handled by the DocumentUpload component
      // through the useUploadProgress hook
      throw new Error("Use the DocumentUpload component for file uploads");
    },
    onSuccess: (data) => {
      // Refresh documents list
      refetchDocuments();
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await apiRequest(`/api/documents/${documentId}`, {
        method: "DELETE",
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Document deleted",
        description: "Document has been removed successfully.",
      });
      // Refresh documents list
      refetchDocuments();
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const queryMutation = useMutation({
    mutationFn: async (query: string) => {
      const response = await apiRequest<QueryResponse>("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          sessionId,
          topK: 5,
          enableTracing,
          debugMode,
        }),
      });
      return response;
    },
    onSuccess: (data) => {
      // If this was the first message (no sessionId), clear the pending message
      if (pendingUserMessage) {
        setPendingUserMessage(null);
      }
      
      setSessionId(data.sessionId);
      setCurrentSources(data.sources);
      setCurrentClassification(data.classification);
      setCurrentAgentTraces(data.agentTraces);
      setCurrentExecutionTime(data.executionTimeMs);
      setCurrentResponseType(data.responseType);
      queryClient.invalidateQueries({ queryKey: ["/api/chat", data.sessionId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Query failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);

  // Streaming query function
  const handleStreamingQuery = async (query: string) => {
    setIsStreaming(true);
    setRefinedQueries([]);
    setShowRefinedQueries(false);
    
    try {
      const response = await fetch("/api/query/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          sessionId,
          topK: 5,
          enableTracing,
          debugMode,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get response reader");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === "refinement") {
                // Handle refined questions
                setRefinedQueries(data.data.refined_queries);
                setShowRefinedQueries(true);
              } else if (data.type === "completion") {
                // Handle main response
                if (pendingUserMessage) {
                  setPendingUserMessage(null);
                }
                
                setSessionId(data.data.sessionId);
                setCurrentSources(data.data.sources);
                setCurrentClassification(data.data.classification);
                setCurrentAgentTraces(data.data.agentTraces);  // Set agent traces!
                setCurrentExecutionTime(data.data.executionTimeMs);
                setCurrentResponseType(data.data.responseType);
                queryClient.invalidateQueries({ queryKey: ["/api/chat", data.data.sessionId] });
              } else if (data.type === "error") {
                // Handle API errors by creating an assistant message
                if (pendingUserMessage) {
                  setPendingUserMessage(null);
                }
                
                // Create an error response message
                const errorMessage: Message = {
                  id: `error-${Date.now()}`,
                  sessionId: sessionId || `temp-session-${Date.now()}`,
                  role: "assistant",
                  content: data.data.error,
                  createdAt: new Date(),
                  sources: null
                };
                
                // Add error message to the current session
                if (sessionId) {
                  queryClient.setQueryData(["/api/chat", sessionId], (oldData: { messages: Message[] } | undefined) => {
                    return {
                      messages: [...(oldData?.messages || []), errorMessage]
                    };
                  });
                } else {
                  // For new sessions, we need to create a temporary session ID
                  const tempSessionId = `temp-session-${Date.now()}`;
                  setSessionId(tempSessionId);
                  queryClient.setQueryData(["/api/chat", tempSessionId], {
                    messages: [errorMessage]
                  });
                }
                
                // Also show a toast for immediate feedback
                toast({
                  title: "API Error",
                  description: "Error details displayed in chat",
                  variant: "destructive",
                });
                return; // Exit the streaming loop
              }
            } catch (error) {
              console.error("Failed to parse streaming data:", error);
            }
          }
        }
      }
    } catch (error) {
      console.error("Streaming query failed:", error);
      toast({
        title: "Query failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSubmit = (message: string) => {
    // Store the pending user message for cases where there's no session yet
    if (!sessionId) {
      setPendingUserMessage(message);
    } else {
      // Add optimistic user message for existing session
      queryClient.setQueryData(["/api/chat", sessionId], (oldData: { messages: Message[] } | undefined) => {
        const newUserMessage: Message = {
          id: `temp-${Date.now()}`,
          sessionId: sessionId,
          role: "user",
          content: message,
          createdAt: new Date(),
          sources: null
        };
        
        return {
          messages: [...(oldData?.messages || []), newUserMessage]
        };
      });
    }
    
    // Use streaming query instead of regular mutation
    handleStreamingQuery(message);
  };

  const handleRefinedQueryClick = (query: string) => {
    // When user clicks a refined question, send it as a new query
    handleSubmit(query);
  };

  const handleUpload = async (file: File) => {
    // The upload is now handled by the DocumentUpload component
    // This function is maintained for compatibility with Header component
    // but the actual upload logic is in useUploadProgress hook
    console.log("Upload handled by DocumentUpload component:", file.name);
  };

  const handleCitationClick = (index: number) => {
    setSelectedSourceIndex(index);
  };

  const handleSamplePromptClick = (prompt: string) => {
    handleSubmit(prompt);
  };

  const handleDeleteDocument = async (documentId: string) => {
    await deleteMutation.mutateAsync(documentId);
  };

  const handleRefreshDocuments = () => {
    refetchDocuments();
  };

  const handleSettingsChange = (key: string, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    
    // Apply settings immediately for relevant items
    if (key === "enableTracing") {
      setEnableTracing(value);
    } else if (key === "debugMode") {
      setDebugMode(value);
    } else if (key === "useGeneralKnowledge") {
      // Add telemetry logging for general knowledge toggle
      console.log(`[CONFIG] General knowledge ${value ? 'enabled' : 'disabled'}`);
      toast({
        title: `General knowledge ${value ? 'enabled' : 'disabled'}`,
        description: `The AI ${value ? 'can now' : 'can no longer'} use its built-in knowledge when no relevant documents are found.`,
      });
      
      // Auto-save the configuration when general knowledge is toggled
      setTimeout(() => {
        handleSaveConfigurationWithSettings(newSettings, false); // Don't show notification for auto-save
      }, 100); // Small delay to ensure state is updated
    } else if (key === "documentRelevanceThreshold") {
      // Add telemetry logging for threshold changes
      console.log(`[CONFIG] Document relevance threshold changed to ${(value * 100).toFixed(0)}%`);
      toast({
        title: "Document threshold updated",
        description: `Relevance threshold set to ${(value * 100).toFixed(0)}%. ${value < 0.5 ? 'More documents will be included.' : 'Only higher-quality documents will be used.'}`,
      });
      
      // Auto-save the configuration when threshold is changed
      setTimeout(() => {
        handleSaveConfigurationWithSettings(newSettings, false); // Don't show notification for auto-save
      }, 500); // Longer delay for slider to allow user to adjust
    }
  };

  const handleSaveConfiguration = async () => {
    return handleSaveConfigurationWithSettings(settings);
  };

  const handleSaveConfigurationWithSettings = async (settingsToSave: typeof settings, showNotification: boolean = true) => {
    try {
      // Extract configuration settings
      const configData = {
        llmProvider: settingsToSave.llmProvider,
        openaiApiKey: settingsToSave.openaiApiKey,
        openaiModel: settingsToSave.openaiModel,
        azureApiKey: settingsToSave.azureApiKey,
        azureEndpoint: settingsToSave.azureEndpoint,
        azureDeploymentName: settingsToSave.azureDeploymentName,
        geminiApiKey: settingsToSave.geminiApiKey,
        geminiModel: settingsToSave.geminiModel,
        embeddingProvider: settingsToSave.embeddingProvider,
        embeddingApiKey: settingsToSave.embeddingApiKey,
        embeddingEndpoint: settingsToSave.embeddingEndpoint,
        embeddingModel: settingsToSave.embeddingModel,
        useGeneralKnowledge: settingsToSave.useGeneralKnowledge,
        documentRelevanceThreshold: settingsToSave.documentRelevanceThreshold,
      };

      console.log('[CONFIG] Saving configuration:', { 
        useGeneralKnowledge: configData.useGeneralKnowledge,
        documentRelevanceThreshold: configData.documentRelevanceThreshold 
      });

      // Save configuration to backend
      await apiRequest("/api/config/save", {
        method: "POST",
        body: JSON.stringify(configData),
        headers: {
          "Content-Type": "application/json",
        },
      });

      // Only show notification if requested
      if (showNotification) {
        toast({
          title: "Configuration saved",
          description: "Your LLM and embeddings configuration has been saved successfully.",
        });
      }
    } catch (error) {
      console.error("Failed to save configuration:", error);
      toast({
        title: "Failed to save configuration",
        description: "There was an error saving your configuration. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Keyboard shortcuts
  const handleKeyboardShortcuts = useCallback((event: KeyboardEvent) => {
    if (!settings.enableKeyboardShortcuts) return;

    const { ctrlKey, metaKey, key } = event;
    const isModifier = ctrlKey || metaKey;

    switch (true) {
      case isModifier && key === ",":
        event.preventDefault();
        setIsSettingsOpen(true);
        break;
      case isModifier && key === "k":
        event.preventDefault();
        inputRef.current?.focus();
        break;
      case isModifier && key === "t":
        event.preventDefault();
        setEnableTracing(prev => !prev);
        toast({
          title: `Agent tracing ${!enableTracing ? "enabled" : "disabled"}`,
          description: `Agent execution traces are now ${!enableTracing ? "visible" : "hidden"}`,
        });
        break;
    }
  }, [settings.enableKeyboardShortcuts, enableTracing, toast]);

  useEffect(() => {
    if (settings.enableKeyboardShortcuts) {
      window.addEventListener("keydown", handleKeyboardShortcuts);
      return () => window.removeEventListener("keydown", handleKeyboardShortcuts);
    }
  }, [handleKeyboardShortcuts, settings.enableKeyboardShortcuts]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory?.messages, queryMutation.isPending, pendingUserMessage]);

  const messages = chatHistory?.messages || [];
  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header 
        onSettingsClick={() => setIsSettingsOpen(true)}
        documents={documentsData || []}
        onRefreshDocuments={handleRefreshDocuments}
        onDeleteDocument={handleDeleteDocument}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">

          <ScrollArea className="flex-1">
            <div className="max-w-4xl mx-auto px-4 py-6">
              <AnimatePresence mode="wait">
                {!hasMessages && !queryMutation.isPending && !pendingUserMessage ? (
                  <EmptyState 
                    onSamplePromptClick={handleSamplePromptClick}
                    uploadedDocuments={documentsData || []}
                  />
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-6"
                  >
                    <AnimatePresence>
                      {/* Show pending user message if there's no session yet */}
                      {pendingUserMessage && !sessionId && (
                        <motion.div
                          key="pending-user-message"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          <MessageBubble
                            message={{
                              id: "pending",
                              sessionId: "pending",
                              role: "user",
                              content: pendingUserMessage,
                              createdAt: new Date(),
                              sources: null
                            }}
                            onCitationClick={() => {}}
                            refinedQueries={refinedQueries}
                            showRefinedQueries={showRefinedQueries}
                            onRefinedQueryClick={handleRefinedQueryClick}
                          />
                        </motion.div>
                      )}
                      
                      {messages.map((message, index) => {
                        // For assistant messages, check if this is the most recent assistant message
                        const isLastAssistantMessage = message.role === "assistant" && 
                          index === messages.length - 1;
                        
                        // For user messages, check if this is the most recent user message
                        const isLastUserMessage = message.role === "user" && 
                          index === messages.length - 1;
                        
                        return (
                          <motion.div
                            key={message.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                          >
                            <MessageBubble
                              message={message}
                              responseType={isLastAssistantMessage ? currentResponseType : undefined}
                              onCitationClick={handleCitationClick}
                              refinedQueries={isLastUserMessage ? refinedQueries : undefined}
                              showRefinedQueries={isLastUserMessage ? showRefinedQueries : false}
                              onRefinedQueryClick={handleRefinedQueryClick}
                            />
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                    
                    <AnimatePresence>
                      {(queryMutation.isPending || isStreaming) && (
                        <TypingIndicator />
                      )}
                    </AnimatePresence>
                    
                    <div ref={messagesEndRef} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </ScrollArea>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-shrink-0 border-t border-border bg-background"
          >
            <div className="max-w-4xl mx-auto px-4 py-4">
              <MessageInput
                ref={inputRef}
                onSubmit={handleSubmit}
                disabled={queryMutation.isPending || isStreaming}
                placeholder={
                  hasMessages 
                    ? "Ask a follow-up question..." 
                    : "Ask about your documents or try a sample query above..."
                }
              />
            </div>
          </motion.div>
        </div>

        <div className="hidden lg:block w-96 border-l border-border bg-card">
          <ContextPanel
            sources={currentSources}
            selectedSourceIndex={selectedSourceIndex}
            classification={
              // Adjust classification display based on actual response type
              currentResponseType === "general_knowledge" && currentClassification
                ? {
                    ...currentClassification,
                    type: "general" as any,
                    reasoning: "Used general AI knowledge (no relevant documents found)"
                  }
                : currentClassification
            }
            agentTraces={currentAgentTraces}
            executionTimeMs={currentExecutionTime}
            responseType={currentResponseType}
            enableTracing={enableTracing}
          />
        </div>
      </div>

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        onSaveConfiguration={handleSaveConfiguration}
      />
    </div>
  );
}
