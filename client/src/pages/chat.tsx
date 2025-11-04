import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Message, type QueryResponse, type QueryClassification, type AgentTrace } from "@shared/schema";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { apiRequest } from "@/lib/queryClient";
import { apiRequest as enhancedApiRequest, API_ENDPOINTS } from "@/lib/api-config";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Settings, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Chat() {
  const isMobile = useIsMobile();
  
  // Sidebar state - mobile-aware initialization
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    // On mobile, always start closed; on desktop, use localStorage
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return false;
    }
    const saved = localStorage.getItem("sidebar-open");
    if (saved !== null) return JSON.parse(saved);
    return window.innerWidth >= 1024; // lg breakpoint
  });

  // Real chat sessions data from API
  const { data: chatSessions, isLoading: isLoadingChatSessions, refetch: refetchChatSessions } = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: async () => {
      const response = await enhancedApiRequest<{
        sessions: Array<{
          id: string;
          title: string;
          userId?: string;
          metadata?: any;
          messageCount: number;
          lastMessageAt?: string;
          lastMessage?: string;
          createdAt: string;
          updatedAt: string;
        }>;
        total: number;
        page: number;
        limit: number;
        hasMore: boolean;
      }>(API_ENDPOINTS.CHAT_SESSIONS);
      
      // Transform the data to match the expected format
      return response.sessions.map(session => ({
        id: session.id,
        title: session.title,
        lastMessage: session.lastMessage || "No messages yet",
        createdAt: session.createdAt,
        messageCount: session.messageCount,
      }));
    },
  });

  // Mock user profile - will be replaced with real data later
  const [userProfile, setUserProfile] = useState({
    name: "John Doe",
    email: "john.doe@company.com",
    avatar: undefined, // Will use initials fallback
    role: "Technology", // Default role from dropdown options
    joinedAt: "2024-01-15T00:00:00Z",
  });

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

  const { data: chatHistory, isLoading: isLoadingHistory } = useQuery<{ messages: Message[] } | null>({
    queryKey: ["chat-history", sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      return await enhancedApiRequest<{ messages: Message[] }>(API_ENDPOINTS.CHAT_HISTORY(sessionId));
    },
    enabled: !!sessionId,
  });

  // Query to fetch uploaded documents
  const { data: documentsData, refetch: refetchDocuments } = useQuery<Array<{
    id: string;
    filename: string;
    size: number;
    uploadedAt: string;
  }>>({
    queryKey: ["documents"],
    queryFn: async () => {
      console.log('[DEBUG] Fetching documents from API...');
      const data = await enhancedApiRequest<Array<{
        id: string;
        filename: string;
        size: number;
        uploadedAt: string;
      }>>(API_ENDPOINTS.DOCUMENTS);
      //console.log('[DEBUG] Documents fetched:', data);
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
      const response = await enhancedApiRequest(API_ENDPOINTS.DOCUMENT_DELETE(documentId), {
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
      const response = await enhancedApiRequest<QueryResponse>(API_ENDPOINTS.QUERY, {
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
      setCurrentAgentTraces((data.agentTraces || []) as unknown as AgentTrace[]);
      setCurrentExecutionTime(data.executionTimeMs);
      setCurrentResponseType(data.responseType);
      queryClient.invalidateQueries({ queryKey: ["chat-history", data.sessionId] });
      
      // Refresh chat sessions to update metadata like message count
      refetchChatSessions();
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
  const handleStreamingQuery = async (query: string, overrideSessionId?: string) => {
    const effectiveSessionId = overrideSessionId || sessionId;
    
    setIsStreaming(true);
    setRefinedQueries([]);
    setShowRefinedQueries(false);
    
    try {
      const response = await fetch(API_ENDPOINTS.QUERY_STREAM, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          sessionId: effectiveSessionId,
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
                queryClient.invalidateQueries({ queryKey: ["chat-history", data.data.sessionId] });
                
                // Refresh chat sessions to update metadata
                refetchChatSessions();
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
                  createdAt: new Date().toISOString(),
                  sources: null,
                  classification: null,
                  agentTraces: null,
                  executionTimeMs: null,
                  responseType: "error",
                  tokenCount: null,
                  contextWindowUsed: null,
                  sequenceNumber: 0,
                  parentMessageId: null,
                };
                
                // Add error message to the current session
                if (effectiveSessionId) {
                  queryClient.setQueryData(["chat-history", effectiveSessionId], (oldData: { messages: Message[] } | undefined) => {
                    return {
                      messages: [...(oldData?.messages || []), errorMessage]
                    };
                  });
                } else {
                  // For new sessions, we need to create a temporary session ID
                  const tempSessionId = `temp-session-${Date.now()}`;
                  setSessionId(tempSessionId);
                  queryClient.setQueryData(["chat-history", tempSessionId], {
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

  const handleSubmit = async (message: string) => {
    // If no session exists, create a new one
    if (!sessionId) {
      try {
        // Create a new chat session
        const newSession = await enhancedApiRequest<{
          id: string;
          title: string;
          userId?: string;
          metadata?: any;
          messageCount: number;
          lastMessageAt?: string;
          createdAt: string;
          updatedAt: string;
        }>(API_ENDPOINTS.CREATE_CHAT_SESSION, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: message.length > 50 ? message.substring(0, 50) + "..." : message,
            metadata: { source: "web-ui" }
          }),
        });
        
        setSessionId(newSession.id);
        
        // Refresh chat sessions list to include the new session
        refetchChatSessions();
        
        // Store the pending user message - but add it to query cache immediately for new session
        setPendingUserMessage(message);
        
        // Add the user message to the new session's cache immediately
        queryClient.setQueryData(["chat-history", newSession.id], {
          messages: [{
            id: `user-${Date.now()}`,
            sessionId: newSession.id,
            role: "user",
            content: message,
            createdAt: new Date().toISOString(),
            sources: null,
            classification: null,
            agentTraces: null,
            executionTimeMs: null,
            responseType: null,
            tokenCount: null,
            contextWindowUsed: null,
            sequenceNumber: 0,
            parentMessageId: null,
          }]
        });
        
        // Clear pending message since we added it to cache
        setPendingUserMessage(null);
        
        // Start the query with the new session ID
        handleStreamingQuery(message, newSession.id);
        return;
      } catch (error) {
        console.error("Failed to create new chat session:", error);
        toast({
          title: "Failed to create chat",
          description: "Could not start a new conversation. Please try again.",
          variant: "destructive",
        });
        return;
      }
    }
    
    // For existing sessions, add optimistic user message
    queryClient.setQueryData(["chat-history", sessionId], (oldData: { messages: Message[] } | undefined) => {
      const newUserMessage: Message = {
        id: `temp-${Date.now()}`,
        sessionId: sessionId,
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
        sources: null,
        classification: null,
        agentTraces: null,
        executionTimeMs: null,
        responseType: null,
        tokenCount: null,
        contextWindowUsed: null,
        sequenceNumber: 0,
        parentMessageId: null,
      };
      
      return {
        messages: [...(oldData?.messages || []), newUserMessage]
      };
    });
    
    // Use streaming query with existing session
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

      // Save configuration to backend using proper API endpoint
      await enhancedApiRequest(API_ENDPOINTS.CONFIG_SAVE, {
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

  // Sidebar handlers - mobile-aware
  const handleSidebarToggle = () => {
    const newState = !isSidebarOpen;
    setIsSidebarOpen(newState);
    // Only persist on desktop
    if (!isMobile) {
      localStorage.setItem("sidebar-open", JSON.stringify(newState));
    }
  };

  const handleChatSelect = (chatId: string) => {
    // Load selected chat session
    setSessionId(chatId);
    // Clear current context when switching chats
    setCurrentSources(undefined);
    setCurrentClassification(undefined);
    setCurrentAgentTraces(undefined);
    setCurrentExecutionTime(undefined);
    setCurrentResponseType(undefined);
    
    // On mobile, close sidebar after selection
    if (isMobile) {
      setIsSidebarOpen(false);
    }
  };

  const handleNewChat = () => {
    // Clear current session and start fresh
    setSessionId(undefined);
    setCurrentSources(undefined);
    setCurrentClassification(undefined);
    setCurrentAgentTraces(undefined);
    setCurrentExecutionTime(undefined);
    setCurrentResponseType(undefined);
    setPendingUserMessage(null);
    // Clear any refined queries
    setRefinedQueries([]);
    setShowRefinedQueries(false);
    
    // On mobile, close sidebar after new chat
    if (isMobile) {
      setIsSidebarOpen(false);
    }
    
    // Refresh chat sessions to update counts and metadata
    refetchChatSessions();
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      await enhancedApiRequest(API_ENDPOINTS.DELETE_CHAT_SESSION(chatId), {
        method: "DELETE",
      });
      
      // Refresh the chat sessions list
      refetchChatSessions();
      
      // If the deleted chat was the current session, clear it
      if (sessionId === chatId) {
        handleNewChat();
      }
      
      toast({
        title: "Chat deleted",
        description: "The conversation has been removed successfully.",
      });
    } catch (error) {
      console.error("Failed to delete chat:", error);
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete the conversation.",
        variant: "destructive",
      });
    }
  };

  // Profile handlers
  const handleUpdateRole = (role: string) => {
    setUserProfile(prev => ({ ...prev, role }));
    toast({
      title: "Role updated",
      description: "Your industry/role has been updated successfully.",
    });
  };

  const handleLogout = () => {
    // Clear user session and redirect to login
    // This would typically clear tokens, reset state, etc.
    toast({
      title: "Signed out",
      description: "You have been signed out successfully.",
    });
    // In a real app, you'd redirect to login page or clear auth state
    console.log("User logged out");
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
        // Disable agent tracing shortcut on mobile since context panel is hidden
        if (!isMobile) {
          event.preventDefault();
          setEnableTracing(prev => !prev);
          toast({
            title: `Agent tracing ${!enableTracing ? "enabled" : "disabled"}`,
            description: `Agent execution traces are now ${!enableTracing ? "visible" : "hidden"}`,
          });
        }
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
    <div className="flex h-screen bg-background relative overflow-hidden">
      {/* Mobile backdrop overlay */}
      <AnimatePresence>
        {isMobile && isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={handleSidebarToggle}
        chatHistory={chatSessions || []}
        currentChatId={sessionId}
        onChatSelect={handleChatSelect}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        userProfile={userProfile}
        onSettingsClick={() => setIsSettingsOpen(true)}
        onUpdateRole={handleUpdateRole}
        onLogout={handleLogout}
      />

      {/* Main Content */}
      <div className={cn(
        "flex flex-col flex-1 min-w-0",
        isMobile && "w-full" // Ensure full width on mobile
      )}>
        <Header 
          onSettingsClick={() => setIsSettingsOpen(true)}
          onMenuClick={handleSidebarToggle}
          documents={documentsData || []}
          onRefreshDocuments={handleRefreshDocuments}
          onDeleteDocument={handleDeleteDocument}
        />

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0">

            <ScrollArea className="flex-1">
              <div className={cn(
                "max-w-4xl mx-auto px-3 py-4 sm:px-4 sm:py-6",
                // For empty state, ensure container takes available height and prevents scrolling
                !hasMessages && !queryMutation.isPending && !pendingUserMessage && [
                  "h-full flex items-center justify-center",
                  "min-h-[calc(100vh-16rem)]" // Account for header and input areas
                ]
              )}>
                <AnimatePresence mode="wait">
                  {!hasMessages && !queryMutation.isPending && !pendingUserMessage ? (
                    <div className="w-full">
                      <EmptyState 
                        onSamplePromptClick={handleSamplePromptClick}
                        uploadedDocuments={documentsData || []}
                      />
                    </div>
                  ) : (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="space-y-4 sm:space-y-6"
                    >
                      <AnimatePresence>
                        {/* Show pending user message for new sessions until it appears in history */}
                        {pendingUserMessage && (!sessionId || (sessionId && messages.length === 0)) && (
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
                                createdAt: new Date().toISOString(),
                                sources: null,
                                classification: null,
                                agentTraces: null,
                                executionTimeMs: null,
                                responseType: null,
                                tokenCount: null,
                                contextWindowUsed: null,
                                sequenceNumber: 0,
                                parentMessageId: null,
                              }}
                              onCitationClick={() => {}}
                              refinedQueries={refinedQueries}
                              showRefinedQueries={showRefinedQueries}
                              onRefinedQueryClick={handleRefinedQueryClick}
                            />
                          </motion.div>
                        )}
                        
                        {messages.map((message: Message, index: number) => {
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
              style={{
                paddingBottom: isMobile ? 'env(safe-area-inset-bottom)' : undefined
              }}
            >
              <div className="max-w-4xl mx-auto px-3 py-3 sm:px-4 sm:py-4">
                <MessageInput
                  ref={inputRef}
                  onSubmit={handleSubmit}
                  disabled={queryMutation.isPending || isStreaming}
                  placeholder={
                    hasMessages
                      ? "Ask a follow-up question..."
                      : "Ask about anything your documents..."
                  }
                />
              </div>
            </motion.div>
          </div>

          {/* Context Panel - Hidden on mobile */}
          {!isMobile && (
            <div className="w-96 border-l border-border bg-card">
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
          )}
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
