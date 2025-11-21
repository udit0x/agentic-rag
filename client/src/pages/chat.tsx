import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@clerk/clerk-react";
import { type QueryResponse, type QueryClassification, type AgentTrace, type Document } from "@shared/schema";
import { type Message } from "@/lib/chat-cache";  // Use extended Message type with serverId
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { MessageBubble } from "@/components/chat/message-bubble";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { MessageInput } from "@/components/chat/message-input";
import { EmptyState } from "@/components/chat/empty-state";
import { ContextPanel } from "@/components/context/context-panel";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { QuotaExhaustedModal } from "@/components/chat/quota-exhausted-modal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OrbitalLoader } from "@/components/ui/orbital-loader";
import { LoadRipple } from "@/components/ui/load-ripple";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useStableSession } from "@/hooks/use-stable-session";
import { useAuthUserId } from "@/hooks/use-user-sync";
import { useQuota, useSyncQuotaFromResponse } from "@/hooks/use-quota";
import { useQuotaStore } from "@/stores/quota-store";
import { useSettingsStore } from "@/stores/settings-store";
import { apiRequest } from "@/lib/queryClient";
import { apiRequest as enhancedApiRequest, API_ENDPOINTS } from "@/lib/api-config";
import { queryClient } from "@/lib/queryClient";
import { applyEventToCache, shouldShowRefinedQueries, mergeServerHistoryIntoCache } from "@/lib/chat-cache";
import { cn } from "@/lib/utils";
import { Settings, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCachedChatHistory, useCachedDocuments } from "@/hooks/use-cached-api";

export default function Chat() {
  const isMobile = useIsMobile();
  const { user } = useUser();
  const userId = useAuthUserId();
  
  // Quota management
  const { quota, isLoading: isLoadingQuota, refreshQuota } = useQuota();
  const syncQuotaFromResponse = useSyncQuotaFromResponse();
  const { quotaRemaining, isUnlimited, decrementQuota } = useQuotaStore();
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);
  
  // Settings store integration - sync enableTracing to local state for backward compat
  const { general, loadConfiguration: loadStoreConfiguration } = useSettingsStore();
  useEffect(() => {
    setEnableTracing(general.enableTracing);
  }, [general.enableTracing]);
  
  // Stable session controller - single source of truth
  const { sessionId, setSession, getSessionId, migrate } = useStableSession();
  
  // Initialize cache hooks
  const { 
    fetchChatSessionHistory, 
    cacheChatSession, 
    preloadChatSessions, 
    invalidateSession 
  } = useCachedChatHistory();
  
  const { fetchDocuments, refreshDocuments } = useCachedDocuments();
  
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
    queryKey: ["chat-sessions", userId],
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
      }>(API_ENDPOINTS.CHAT.SESSIONS);
      
      // Transform the data to match the expected format
      const sessions = response.sessions.map(session => ({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt, // ✅ TIMESTAMP FIX: Pass last activity time
        messageCount: session.messageCount,
      }));
      
      return sessions;
    },
    enabled: !!userId, // Only fetch when userId is available
    staleTime: 60 * 1000, // Increased: 30s → 60s to reduce refetches
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false, // Disabled aggressive refetch on focus
    refetchOnReconnect: true, // Refresh when network reconnects
  });

  // User profile from Clerk
  const userProfile = {
    name: user?.fullName || user?.username || "Anonymous",
    email: user?.primaryEmailAddress?.emailAddress || "user@example.com",
    avatar: user?.imageUrl,
    role: (user?.unsafeMetadata?.role as string) || "Technology",
    joinedAt: user?.createdAt?.toString() || new Date().toISOString(),
  };

  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number | undefined>();
  const [selectedMessageId, setSelectedMessageId] = useState<string | undefined>();
  const [currentSources, setCurrentSources] = useState<Message["sources"]>();
  const [currentClassification, setCurrentClassification] = useState<QueryClassification | undefined>();
  const [currentAgentTraces, setCurrentAgentTraces] = useState<AgentTrace[] | undefined>();
  const [currentExecutionTime, setCurrentExecutionTime] = useState<number | undefined>();
  const [currentResponseType, setCurrentResponseType] = useState<string | undefined>();
  const [enableTracing, setEnableTracing] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTypingIndicator, setShowTypingIndicator] = useState(false);
  const [isLoadingChatHistory, setIsLoadingChatHistory] = useState(false);
  const [loadingChatId, setLoadingChatId] = useState<string | undefined>();
  const [isAppInitialized, setIsAppInitialized] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [isContextPanelVisible, setIsContextPanelVisible] = useState(true);
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
    azureApiKey: "",
    azureEndpoint: "",
    azureDeploymentName: "gpt-4o",
    geminiApiKey: "",
    geminiModel: "gemini-1.5-pro",
    // Embeddings Configuration - defaults from environment
    embeddingProvider: "azure" as "openai" | "azure",
    embeddingApiKey: "",
    embeddingEndpoint: "",
    embeddingModel: "text-embedding-3-large",
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<{ focus: () => void }>(null);
  const hasPreloadedRef = useRef<boolean>(false);
  
  //P0 FIX: Smart scroll management to prevent layout thrashing
  const isUserScrollingRef = useRef<boolean>(false);
  const lastMessageCountRef = useRef<number>(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // 🔧 CACHE FIX: Debounce sidebar refetch to prevent duplicate calls
  const sidebarRefetchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  
  const { toast } = useToast();

  // 🔧 CACHE FIX: Debounced sidebar refetch to prevent spam
  const debouncedRefetchSidebar = useCallback((delay: number = 500) => {
    if (sidebarRefetchDebounceRef.current) {
      clearTimeout(sidebarRefetchDebounceRef.current);
    }
    
    sidebarRefetchDebounceRef.current = setTimeout(() => {
      refetchChatSessions();
      sidebarRefetchDebounceRef.current = null;
    }, delay);
  }, [refetchChatSessions]);

  // Load saved configuration on mount
  useEffect(() => {
    const loadConfiguration = async () => {
      try {
        const response: any = await enhancedApiRequest(API_ENDPOINTS.CONFIG.CURRENT);
        if (response && response.config) {
          const config = response.config;
          
          // Update settings with loaded configuration
          setSettings(prev => ({
            ...prev,
            llmProvider: config.llmProvider || prev.llmProvider,
            openaiApiKey: config.openaiApiKey || "",
            openaiModel: config.openaiModel || prev.openaiModel,
            azureApiKey: config.azureApiKey || "",
            azureEndpoint: config.azureEndpoint || "",
            azureDeploymentName: config.azureDeploymentName || "",
            embeddingProvider: config.embeddingProvider || prev.embeddingProvider,
            embeddingApiKey: config.embeddingApiKey || "",
            embeddingEndpoint: config.embeddingEndpoint || "",
            embeddingModel: config.embeddingModel || prev.embeddingModel,
            useGeneralKnowledge: config.useGeneralKnowledge ?? prev.useGeneralKnowledge,
            documentRelevanceThreshold: config.documentRelevanceThreshold ?? prev.documentRelevanceThreshold,
          }));
        }
      } catch (error) {
        console.error("Failed to load configuration:", error);
        // Don't show error to user, just use defaults
      }
    };

    loadConfiguration();
  }, []); // Run once on mount

  // Select a message to display its traces in context panel (defined early for use in mutations)
  const selectMessageForContext = useCallback((messageId: string, sources?: Message["sources"], agentTraces?: any[]) => {
    setSelectedMessageId(messageId);
    setCurrentSources(sources);
    setSelectedSourceIndex(undefined);
    
    // Auto-open context panel when message is selected
    setIsContextPanelVisible(true);
    
    // 🛡️ Guard against empty overwrites - only set if agentTraces is explicitly provided
    if (agentTraces !== undefined) {
      if (agentTraces && agentTraces.length > 0) {
        setCurrentAgentTraces(agentTraces);
      } else {
        setCurrentAgentTraces([]);
      }
    }
    // Don't overwrite existing traces if agentTraces is undefined
  }, []);

  const { data: chatHistory, isLoading: isLoadingHistory } = useQuery({
    queryKey: ["chat-history", sessionId],
    queryFn: async () => {
      if (!sessionId) {
        return null;
      }
      
      // For temp sessions, check cache first (messages are added optimistically)
      if (sessionId.startsWith('temp-session-')) {
        const cachedData = queryClient.getQueryData<{ messages: Message[]; refinedQueriesFor?: string; refinedQueries?: string[] }>(["chat-history", sessionId]);
        if (cachedData) {
          return cachedData;
        }
        return { messages: [] };
      }
      
      // CRITICAL FIX: Preserve refined queries during refetch
      // Get the current cache BEFORE fetching to preserve client-side data
      const currentCache = queryClient.getQueryData<{ 
        messages: Message[]; 
        refinedQueriesFor?: string; 
        refinedQueries?: string[] 
      }>(["chat-history", sessionId]);
      
      // Fetch fresh messages from server
      const serverMessages = await fetchChatSessionHistory(sessionId);
      const mergedMessages = mergeServerHistoryIntoCache(currentCache?.messages || [], serverMessages);
      
      //  PRESERVE refined queries from cache (they're client-side only, not from server)
      return { 
        messages: mergedMessages,
        refinedQueriesFor: currentCache?.refinedQueriesFor, // Preserve from cache
        refinedQueries: currentCache?.refinedQueries,       // Preserve from cache
      };
    },
    enabled: !!sessionId,
    staleTime: 60 * 1000, // Increased: 30s → 60s to reduce refetches
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false, // Disabled aggressive refetch - causes UI freezing
    refetchOnReconnect: true, //  Revalidate when network reconnects
    // Removed placeholderData: keepPreviousData - it was preventing isLoading from being true
  });

  // Handle loading state changes
  useEffect(() => {
    if (!isLoadingHistory && loadingChatId) {
      // Clear loading state when chat history finishes loading
      const timer = setTimeout(() => {
        setIsLoadingChatHistory(false);
        setLoadingChatId(undefined);
      }, 100); // Small delay to ensure smooth transition
      
      return () => clearTimeout(timer);
    }
  }, [isLoadingHistory, loadingChatId]);

  // Also handle cases where the query might error or be cancelled
  useEffect(() => {
    if (loadingChatId && sessionId !== loadingChatId) {
      // If the session changed but we're still showing loading for a different chat, clear it
      setIsLoadingChatHistory(false);
      setLoadingChatId(undefined);
    }
  }, [sessionId, loadingChatId]);

  // Fallback timeout to clear loading state if it gets stuck
  useEffect(() => {
    if (isLoadingChatHistory && loadingChatId) {
      const timeout = setTimeout(() => {
        setIsLoadingChatHistory(false);
        setLoadingChatId(undefined);
      }, 10000); // 10 second timeout
      
      return () => clearTimeout(timeout);
    }
  }, [isLoadingChatHistory, loadingChatId]);

  // Handle initial app loading with minimum loading time
  useEffect(() => {
    // Set a minimum loading time to prevent flash of loading screen
    const timer = setTimeout(() => {
      setIsAppInitialized(true);
    }, 1500); // 1.5 seconds minimum

    // If data loads before the timer, the loading screen will still show until timer completes
    // If data takes longer, initialization will be set once the timer completes
    return () => clearTimeout(timer);
  }, []); // Only run once on mount

  // Query to fetch uploaded documents using cache
  const { data: documentsData, isLoading: isLoadingDocuments, refetch: refetchDocuments } = useQuery({
    queryKey: ["documents", userId],
    queryFn: () => fetchDocuments(false),
    enabled: !!userId, // Only fetch when userId is available
    staleTime: 5 * 60 * 1000, // 5 minutes - matches cache TTL
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false, // Disabled aggressive refetch
    refetchOnReconnect: true, // Refresh on reconnect
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      // This is no longer used directly - uploads are handled by the DocumentUpload component
      // through the useUploadProgress hook
      throw new Error("Use the DocumentUpload component for file uploads");
    },
    onSuccess: (data) => {
      // Refresh documents list
      refreshDocuments();
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
      const response = await enhancedApiRequest(API_ENDPOINTS.DOCUMENT.DELETE(documentId), {
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
      refreshDocuments();
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
      const response = await enhancedApiRequest<QueryResponse>(API_ENDPOINTS.EXECUTE, {
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
      if (pendingUserMessage) {
        setPendingUserMessage(null);
      }

      setSession(data.sessionId);
      setCurrentSources(data.sources);
      setCurrentClassification(data.classification);
      setCurrentExecutionTime(data.executionTimeMs);
      setCurrentResponseType(data.responseType);

      if (data.messageId) {
        selectMessageForContext(data.messageId, data.sources, (data.agentTraces || []));
      } else {
        setCurrentAgentTraces((data.agentTraces || []) as unknown as AgentTrace[]);
      }


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

  // Streaming query function - refactored to use unified cache gateway
  const handleStreamingQuery = async (
    query: string,
    documentIds?: string[]
  ) => {
    const streamSessionId = getSessionId(); // Capture session at stream start
    if (!streamSessionId) {
      throw new Error("Cannot stream without a session");
    }
    
    // 🔧 CACHE FIX: Track if this is a new session for sidebar update
    const isNewSession = streamSessionId.startsWith('temp-session-');

    let accumulatedContent = "";
    let hasReceivedRefinement = false;
    let refinementTimeout: NodeJS.Timeout | null = null;
    
    //P0 FIX: Token batching to prevent re-render storms
    let batchedChunks = "";
    let batchFlushTimer: NodeJS.Timeout | null = null;
    let animationFrameId: number | null = null;
    
    const flushBatchedChunks = () => {
      if (!batchedChunks) return;
      
      const currentSession = getSessionId();
      if (currentSession) {
        const chunksToFlush = batchedChunks;
        batchedChunks = ""; // Clear immediately to prevent duplicate flushes
        
        // Use requestAnimationFrame for smooth UI updates
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
        }
        
        animationFrameId = requestAnimationFrame(() => {
          applyEventToCache(queryClient, {
            type: "chunk",
            sessionId: currentSession,
            assistantServerId: lastMessageId || undefined,
            append: chunksToFlush
          });
          animationFrameId = null;
        });
      }
    };
    
    let lastMessageId: string | null = null;

    try {
      const response = await fetch(API_ENDPOINTS.EXECUTE_STREAM, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          query,
          sessionId: streamSessionId.startsWith('temp-session-') ? undefined : streamSessionId,
          topK: 5,
          enableTracing,
          debugMode,
          documentIds,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[STREAM] HTTP error response body:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get response reader");
      }

      // Set timeout for refinement (5 seconds max wait)
      refinementTimeout = setTimeout(() => {
        if (!hasReceivedRefinement) {
          hasReceivedRefinement = true;
        }
      }, 5000);

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Flush any remaining batched chunks on stream end
          if (batchFlushTimer) {
            clearTimeout(batchFlushTimer);
            batchFlushTimer = null;
          }
          flushBatchedChunks();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "started") {
                if (data.data.sessionId) {
                  const realSessionId = data.data.sessionId;
                  const userMessageId = data.data.userMessageId;
                  
                  applyEventToCache(
                    queryClient, 
                    { 
                      type: "started", 
                      tempId: streamSessionId.startsWith('temp-session-') ? streamSessionId : undefined,
                      realId: realSessionId,
                      userMessageId: userMessageId,
                    },
                    (tempId, realId, qc, userId) => migrate(tempId, realId, qc, userId)
                  );
                }
              } 
              
              else if (data.type === "token" || data.type === "chunk" || data.type === "content") {
                const contentChunk = data.data.content || data.data.token || data.data.chunk;
                if (contentChunk) {
                  accumulatedContent += contentChunk;
                  
                  //P0 FIX: Batch chunks instead of applying immediately
                  if (data.data.messageId) {
                    lastMessageId = data.data.messageId;
                    batchedChunks += contentChunk;
                    
                    // Schedule flush after 40ms (balance between smoothness and responsiveness)
                    if (batchFlushTimer) {
                      clearTimeout(batchFlushTimer);
                    }
                    
                    batchFlushTimer = setTimeout(() => {
                      flushBatchedChunks();
                      batchFlushTimer = null;
                    }, 40);
                  }
                }
              } 
              
              else if (data.type === "refinement") {
                hasReceivedRefinement = true;
                if (refinementTimeout) {
                  clearTimeout(refinementTimeout);
                  refinementTimeout = null;
                }

                const currentSession = getSessionId();
                if (currentSession && data.data.userMessageId) {
                  const refinedQueries = data.data.refined_queries || [];

                  // Only apply if we have valid queries
                  if (refinedQueries.length > 0) {
                    applyEventToCache(queryClient, {
                      type: "refinement",
                      sessionId: currentSession,
                      userMessageId: data.data.userMessageId,
                      refined: refinedQueries
                    });
                  }
                }
              } 
              
              else if (data.type === "completion") {
                //P0 FIX: Flush remaining chunks before completion
                if (batchFlushTimer) {
                  clearTimeout(batchFlushTimer);
                  batchFlushTimer = null;
                }
                flushBatchedChunks();
                
                if (pendingUserMessage) {
                  setPendingUserMessage(null);
                }

                const currentSession = getSessionId();
                if (currentSession && data.data.messageId && data.data.userMessageId) {
                  const messageContent = accumulatedContent || data.data.answer || data.data.content || data.data.response || "[No content received]";
                  
                  // Sync quota from response
                  syncQuotaFromResponse(data.data);
                  
                  applyEventToCache(queryClient, {
                    type: "completion",
                    sessionId: currentSession,
                    userMessageId: data.data.userMessageId,
                    assistantServerId: data.data.messageId,
                    answer: messageContent,
                    meta: {
                      sources: data.data.sources,
                      classification: data.data.classification,
                      agentTraces: data.data.agentTraces,
                      executionTimeMs: data.data.executionTimeMs,
                      responseType: data.data.responseType,
                      tokenCount: data.data.tokenCount || null,
                      contextWindowUsed: data.data.contextWindowUsed || null,
                      sequenceNumber: data.data.sequenceNumber || 0,
                      parentMessageId: data.data.parentMessageId || null,
                    }
                  });

                  setCurrentSources(data.data.sources);
                  setCurrentClassification(data.data.classification);
                  setCurrentExecutionTime(data.data.executionTimeMs);
                  setCurrentResponseType(data.data.responseType);

                  // Hide typing indicator immediately on completion
                  setShowTypingIndicator(false);

                  if (data.data.messageId) {
                    selectMessageForContext(data.data.messageId, data.data.sources, data.data.agentTraces);
                  } else {
                    setCurrentAgentTraces(data.data.agentTraces);
                  }
                  
                  // 🔧 CACHE FIX: Debounced refetch to update message count in sidebar
                  // New sessions: 500ms delay, existing: 2s delay
                  const refetchDelay = isNewSession ? 500 : 2000;
                  debouncedRefetchSidebar(refetchDelay);
                }
              } 
              
              else if (data.type === "title_update") {
                // Refetch sessions when title is updated (usually first message in new chat)
                // Use immediate refetch (no delay) for title updates
                debouncedRefetchSidebar(100);
              } 
              
              else if (data.type === "error") {
                if (pendingUserMessage) {
                  setPendingUserMessage(null);
                }

                const currentSession = getSessionId();
                if (currentSession) {
                  applyEventToCache(queryClient, {
                    type: "error",
                    sessionId: currentSession,
                    message: data.data.error
                  });
                }

                toast({
                  title: "API Error",
                  description: "Error details displayed in chat",
                  variant: "destructive",
                });
                return;
              }
            } catch (error) {
              console.error("Failed to parse streaming data:", error);
            }
          }
        }
      }
    } catch (error) {
      console.error('[STREAM] Streaming query failed with error:', error);
      console.error('[STREAM] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        type: typeof error,
        error: error
      });
      
      toast({
        title: "Query failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      //Clean up batch timers
      if (batchFlushTimer) {
        clearTimeout(batchFlushTimer);
      }
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      if (refinementTimeout) {
        clearTimeout(refinementTimeout);
      }
      setIsStreaming(false);
    }
  };

  const handleSubmit = async (content: string, documentIds: string[] = []) => {
    if (!content.trim()) return;

    // Check quota before allowing submission
    if (!isUnlimited && quotaRemaining <= 0) {
      setIsQuotaModalOpen(true);
      return;
    }

    // Optimistically decrement quota
    if (!isUnlimited) {
      decrementQuota();
    }

    const optimisticId = `optimistic-${crypto.randomUUID()}`;

    const optimisticMessage: Message = {
      id: optimisticId,
      role: "user" as const,
      content,
      createdAt: new Date().toISOString(),
      sessionId: sessionId || "",
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

    // Create new session for first message
    if (!sessionId) {
      const tempSessionId = `temp-session-${crypto.randomUUID()}`;
      setSession(tempSessionId);
      
      queryClient.setQueryData(
        ["chat-history", tempSessionId],
        {
          messages: [optimisticMessage],
          refinedQueriesFor: undefined,
          refinedQueries: undefined,
        }
      );
    } else {
      // Add optimistic message to existing session
      queryClient.setQueryData(
        ["chat-history", sessionId],
        (old?: { messages: Message[]; refinedQueriesFor?: string; refinedQueries?: string[] }) => {
          // Clear old refined queries when new message is sent (they're only for the latest question)
          const result = {
            messages: [...(old?.messages ?? []), optimisticMessage],
            refinedQueriesFor: undefined,
            refinedQueries: undefined,
          };
          
          return result;
        }
      );
    }

    setIsStreaming(true);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    
    // Use streaming query with error handling
    try {
      await handleStreamingQuery(content, documentIds.length > 0 ? documentIds : undefined);
    } catch (error) {
      // Rollback optimistic update on error
      console.error("[SUBMIT] Streaming query failed, rolling back optimistic update:", error);
      
      const currentSession = getSessionId();
      if (currentSession) {
        queryClient.setQueryData(
          ["chat-history", currentSession],
          (old?: { messages: Message[]; refinedQueriesFor?: string; refinedQueries?: string[] }) => {
            if (!old) return old;
            
            return {
              ...old,
              messages: old.messages.filter(m => m.id !== optimisticId),
            };
          }
        );
      }
      
      // Show error toast
      toast({
        title: "Message failed to send",
        description: error instanceof Error ? error.message : "Failed to send message. Please try again.",
        variant: "destructive",
      });
      
      setIsStreaming(false);
    }
  };

  const handleRefinedQueryClick = (query: string) => {
    // Prevent triggering while already processing
    if (isStreaming || queryMutation.isPending) {
      return;
    }
    
    // When user clicks a refined question, send it as a new query
    handleSubmit(query);
  };

  const handleUpload = async (file: File) => {
    // The upload is now handled by the DocumentUpload component
    // This function is maintained for compatibility with Header component
    // but the actual upload logic is in useUploadProgress hook
  };

  const handleCitationClick = (index: number, messageSources: Message["sources"], messageId: string, agentTraces?: any[]) => {
    setSelectedSourceIndex(index);
    setCurrentSources(messageSources);
    
    // Auto-open context panel when citation is clicked
    setIsContextPanelVisible(true);
    
    // Also select this message for the context panel to show its agent traces
    selectMessageForContext(messageId, messageSources, agentTraces);
  };

  const handleDeleteDocument = async (documentId: string) => {
    await deleteMutation.mutateAsync(documentId);
  };

  const handleRefreshDocuments = () => {
    refreshDocuments();
    refetchDocuments();
  };

  const handleSettingsChange = (key: string, value: any) => {
    setSettings(prev => {
      const newSettings = { ...prev, [key]: value };
      
      // Apply settings immediately for relevant items
      if (key === "enableTracing") {
        setEnableTracing(value);
      } else if (key === "debugMode") {
        setDebugMode(value);
      } else if (key === "useGeneralKnowledge") {
        // Add telemetry logging for general knowledge toggle
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
        toast({
          title: "Document threshold updated",
          description: `Relevance threshold set to ${(value * 100).toFixed(0)}%. ${value < 0.5 ? 'More documents will be included.' : 'Only higher-quality documents will be used.'}`,
        });
        
        // Auto-save the configuration when threshold is changed
        setTimeout(() => {
          handleSaveConfigurationWithSettings(newSettings, false); // Don't show notification for auto-save
        }, 500); // Longer delay for slider to allow user to adjust
      }
      
      return newSettings;
    });
  };

  const handleSaveConfiguration = async () => {
    return handleSaveConfigurationWithSettings(settings);
  };

  const handleDeleteConfiguration = async () => {
    try {
      // Delete the personal API key from the users table (restores quota system)
      await enhancedApiRequest(API_ENDPOINTS.USER.KEY, {
        method: "DELETE",
      });

      // Clear all API configuration fields from settings
      setSettings(prev => ({
        ...prev,
        openaiApiKey: "",
        azureApiKey: "",
        azureEndpoint: "",
        azureDeploymentName: "",
        embeddingApiKey: "",
        embeddingEndpoint: "",
      }));

      // Refresh quota immediately to reflect changes in UI
      await refreshQuota();

      toast({
        title: "Configuration removed",
        description: "Your API keys have been removed. You'll use the free tier with quota limits.",
      });
    } catch (error) {
      console.error("Failed to delete configuration:", error);
      toast({
        title: "Failed to remove configuration",
        description: "There was an error removing your configuration. Please try again.",
        variant: "destructive",
      });
    }
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
        embeddingProvider: settingsToSave.embeddingProvider,
        embeddingApiKey: settingsToSave.embeddingApiKey,
        embeddingEndpoint: settingsToSave.embeddingEndpoint,
        embeddingModel: settingsToSave.embeddingModel,
        useGeneralKnowledge: settingsToSave.useGeneralKnowledge,
        documentRelevanceThreshold: settingsToSave.documentRelevanceThreshold,
      };

      // Save configuration
      await enhancedApiRequest(API_ENDPOINTS.CONFIG.SAVE, {
        method: "POST",
        body: JSON.stringify(configData),
        headers: {
          "Content-Type": "application/json",
        },
      });

      // Also save the LLM API key as personal key to bypass quota system
      // Determine which API key to save based on provider
      let personalApiKey = "";
      let personalProvider = settingsToSave.llmProvider;
      
      if (settingsToSave.llmProvider === "openai" && settingsToSave.openaiApiKey) {
        personalApiKey = settingsToSave.openaiApiKey;
      } else if (settingsToSave.llmProvider === "azure" && settingsToSave.azureApiKey) {
        personalApiKey = settingsToSave.azureApiKey;
      }

      // If user provided an API key, save it as their personal key (bypasses quota)
      if (personalApiKey) {
        try {
          await enhancedApiRequest(API_ENDPOINTS.USER.KEY, {
            method: "POST",
            body: JSON.stringify({
              apiKey: personalApiKey,
              provider: personalProvider,
            }),
            headers: {
              "Content-Type": "application/json",
            },
          });
        } catch (keyError) {
          console.error("Failed to save personal key:", keyError);
          // Don't fail the whole operation if personal key save fails
        }
      }

      // Refresh quota to update UI (shows "Your Key" badge)
      await refreshQuota();

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

  const handleChatSelect = async (chatId: string) => {
    if (isStreaming) {
      toast({
        title: "Please wait",
        description: "A message is being processed. Please wait before switching chats.",
      });
      return;
    }

    // � SINGLE TRUTH RULE: Always refetch unless session is already selected AND has messages
    const cached = queryClient.getQueryData<{ messages: Message[] }>(["chat-history", chatId]);
    const hasMessages = (cached?.messages?.length ?? 0) > 0;

    if (!(sessionId === chatId && hasMessages)) {
      queryClient.invalidateQueries({
        queryKey: ["chat-history", chatId],
        exact: true
      });
    }

    // Set session immediately
    setSession(chatId);

    // Set loading state
    setIsLoadingChatHistory(true);
    setLoadingChatId(chatId);

    // Clear current context
    setCurrentSources(undefined);
    setCurrentClassification(undefined);
    setCurrentAgentTraces(undefined);
    setCurrentExecutionTime(undefined);
    setCurrentResponseType(undefined);

    if (isMobile) {
      setIsSidebarOpen(false);
    }
  };

  const handleNewChat = async () => {
    if (isStreaming) {
      toast({
        title: "Please wait",
        description: "A message is being processed. Please wait before starting a new chat.",
      });
      return;
    }

    // Clear query cache for current session
    if (sessionId) {
      queryClient.removeQueries({ queryKey: ["chat-history", sessionId] });
      // Also clear any temp session caches
      const allQueries = queryClient.getQueryCache().getAll();
      allQueries.forEach(query => {
        const key = query.queryKey[1];
        if (typeof key === 'string' && key.startsWith('temp-session-')) {
          queryClient.removeQueries({ queryKey: query.queryKey });
        }
      });
    }

    // Clear session and all related state
    setSession(undefined);
    setCurrentSources(undefined);
    setCurrentClassification(undefined);
    setCurrentAgentTraces(undefined);
    setCurrentExecutionTime(undefined);
    setCurrentResponseType(undefined);
    setPendingUserMessage(null);
    setSelectedDocumentIds([]);
    setIsStreaming(false);

    // Use refetchQueries with await to ensure fresh data before switching
    await queryClient.refetchQueries({
      queryKey: ["chat-history"],
      exact: false
    });

    if (isMobile) {
      setIsSidebarOpen(false);
    }

    // 🔧 CACHE FIX: Use debounced refetch to prevent spam
    debouncedRefetchSidebar(500);
  };

  // Handle document selection changes
  const handleDocumentSelectionChange = (documentIds: string[]) => {
    setSelectedDocumentIds(documentIds);
  };

  // Extract messages and documents with proper typing
  const messages = (chatHistory as { messages: Message[]; refinedQueriesFor?: string; refinedQueries?: string[] } | null)?.messages || [];
  const refinedQueriesFor = (chatHistory as { messages: Message[]; refinedQueriesFor?: string; refinedQueries?: string[] } | null)?.refinedQueriesFor;
  const refinedQueries = (chatHistory as { messages: Message[]; refinedQueriesFor?: string; refinedQueries?: string[] } | null)?.refinedQueries || [];
  const hasMessages = messages.length > 0;
  // Include isLoadingHistory to prevent empty state flash during chat switching
  const shouldShowChatView = hasMessages || isStreaming || queryMutation.isPending || isLoadingHistory;
  const documents = (documentsData as any[] | undefined) || [];

  const handleDeleteChat = async (chatId: string) => {
    try {
      // Optimistically remove from local state IMMEDIATELY
      queryClient.setQueryData(["chat-sessions"], (oldData: any[] | undefined) => {
        return oldData?.filter(chat => chat.id !== chatId) || [];
      });
      
      // If the deleted chat was the current session, clear it immediately
      if (sessionId === chatId) {
        handleNewChat();
      }
      
      // Invalidate cache for the deleted chat
      invalidateSession(chatId);
      
      // Show success toast immediately
      toast({
        title: "Chat deleted",
        description: "The conversation has been removed successfully.",
      });
      
      // Fire DELETE call in background (non-blocking)
      enhancedApiRequest(API_ENDPOINTS.CHAT.DELETE(chatId), {
        method: "DELETE",
      })
        .then(() => {
          // 🔧 CACHE FIX: Use debounced refetch to prevent spam
          debouncedRefetchSidebar(500);
        })
        .catch(error => {
          console.error("Failed to delete chat:", error);
          
          // 🔧 CACHE FIX: Use debounced refetch to prevent spam
          debouncedRefetchSidebar(500);
          
          toast({
            title: "Delete failed", 
            description: error instanceof Error ? error.message : "Failed to delete the conversation.",
            variant: "destructive",
          });
        });
        
    } catch (error) {
      console.error("Failed to delete chat:", error);
      
      // 🔧 CACHE FIX: Use debounced refetch to prevent spam
      debouncedRefetchSidebar(500);
      
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete the conversation.",
        variant: "destructive",
      });
    }
  };

  // Profile handlers
  const handleUpdateRole = async (role: string) => {
    // Update role in Clerk user metadata using unsafeMetadata
    try {
      if (user) {
        await user.update({
          unsafeMetadata: {
            ...user.unsafeMetadata,
            role,
          },
        });
        
        toast({
          title: "Role updated",
          description: "Your industry/role has been updated successfully.",
        });
      }
    } catch (error) {
      console.error("Error updating role:", error);
      toast({
        title: "Update failed",
        description: "Failed to update role. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleLogout = async () => {
    // Clear user session using Clerk
    try {
      window.location.href = "/";
      toast({
        title: "Signed out",
        description: "You have been signed out successfully.",
      });
    } catch (error) {
      console.error("Error signing out:", error);
      toast({
        title: "Signout failed",
        description: "Failed to sign out. Please try again.",
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

  // 🛡️ Tab visibility handler - revalidate when user returns to tab after being idle
  // Optimized to prevent refetch storms during streaming
  useEffect(() => {
    let lastVisibilityChange = Date.now();
    let healthCheckInterval: NodeJS.Timeout | null = null;
    let refetchDebounceTimeout: NodeJS.Timeout | null = null;
    
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const idleTime = Date.now() - lastVisibilityChange;
        
        //Don't refetch if actively streaming
        if (isStreaming) {
          return;
        }
        
        // Only refetch if tab was hidden for more than 2 minutes (increased threshold)
        if (idleTime > 2 * 60 * 1000) {
          // Debounce refetches to prevent storm when rapidly switching tabs
          if (refetchDebounceTimeout) {
            clearTimeout(refetchDebounceTimeout);
          }
          
          refetchDebounceTimeout = setTimeout(() => {
            // 🚀 P3 FIX: Double-check not streaming before refetch
            if (isStreaming) return;
            
            // Use refetchQueries instead of invalidateQueries for stale-while-revalidate pattern
            if (sessionId && !sessionId.startsWith('temp-session-')) {
              queryClient.refetchQueries({
                queryKey: ["chat-history", sessionId],
                exact: true,
              }).catch(err => console.warn('[VISIBILITY] Refetch failed:', err));
            }
            
            // Stagger refetches to prevent simultaneous network calls
            setTimeout(() => {
              if (isStreaming) return;
              queryClient.refetchQueries({
                queryKey: ["chat-sessions"],
                exact: true,
              }).catch(err => console.warn('[VISIBILITY] Sessions refetch failed:', err));
            }, 500);
            
            setTimeout(() => {
              if (isStreaming) return;
              queryClient.refetchQueries({
                queryKey: ["documents"],
                exact: true,
              }).catch(err => console.warn('[VISIBILITY] Documents refetch failed:', err));
            }, 1000);
          }, 300); // 300ms debounce
        }
        
        // Start periodic health check when tab is active
        if (!healthCheckInterval) {
          healthCheckInterval = setInterval(() => {
            // Skip health check during streaming
            if (isStreaming) return;
            
            // Check if cache is stale every 2 minutes
            if (sessionId && !sessionId.startsWith('temp-session-')) {
              const cacheData = queryClient.getQueryState(["chat-history", sessionId]);
              const cacheAge = cacheData?.dataUpdatedAt ? Date.now() - cacheData.dataUpdatedAt : Infinity;
              
              // If cache is older than 5 minutes, refetch
              if (cacheAge > 5 * 60 * 1000) {
                queryClient.refetchQueries({
                  queryKey: ["chat-history", sessionId],
                  exact: true,
                }).catch(err => console.warn('[HEALTH] Background refetch failed:', err));
              }
            }
          }, 2 * 60 * 1000); // Check every 2 minutes
        }
      } else {
        // Tab hidden - stop health checks
        if (healthCheckInterval) {
          clearInterval(healthCheckInterval);
          healthCheckInterval = null;
        }
        if (refetchDebounceTimeout) {
          clearTimeout(refetchDebounceTimeout);
          refetchDebounceTimeout = null;
        }
      }
      
      lastVisibilityChange = Date.now();
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Start health check immediately if tab is visible
    if (!document.hidden) {
      handleVisibilityChange();
    }
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
      }
      if (refetchDebounceTimeout) {
        clearTimeout(refetchDebounceTimeout);
      }
    };
  }, [sessionId, isStreaming]); // 🚀 P3 FIX: Added isStreaming to deps

  // Smart scroll management - only scroll when truly needed
  useEffect(() => {
    // Clear any pending scroll timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    const shouldScroll = (
      // Scroll when message count changes (new message added)
      messages.length > lastMessageCountRef.current ||
      // Scroll when streaming completes
      (!isStreaming && lastMessageCountRef.current > 0) ||
      // Scroll when pending message appears
      queryMutation.isPending ||
      pendingUserMessage
    );
    
    if (shouldScroll && !isUserScrollingRef.current) {
      scrollTimeoutRef.current = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 100);
    }
    
    lastMessageCountRef.current = messages.length;
    
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [messages.length, isStreaming, queryMutation.isPending, pendingUserMessage]);
  
  // Detect user manual scrolling to prevent auto-scroll interruption
  useEffect(() => {
    const scrollArea = document.querySelector('[data-radix-scroll-area-viewport]');
    if (!scrollArea) return;
    
    let scrollTimeout: NodeJS.Timeout;
    
    const handleScroll = () => {
      isUserScrollingRef.current = true;
      
      // Reset after 2 seconds of no scrolling
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 2000);
    };
    
    scrollArea.addEventListener('scroll', handleScroll);
    
    return () => {
      scrollArea.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  // Deferred typing indicator to prevent flicker before optimistic message paints
  useEffect(() => {
    if (isStreaming) {
      const timer = setTimeout(() => setShowTypingIndicator(true), 50);
      return () => clearTimeout(timer);
    } else {
      setShowTypingIndicator(false);
    }
  }, [isStreaming]);

  // Auto-select the most recent assistant message when loading a chat (if no message is currently selected)
  useEffect(() => {
    if (!isLoadingChatHistory && messages && messages.length > 0 && !selectedMessageId) {
      // Find the most recent assistant message with agent traces (iterate backwards without copying)
      let lastAssistantMessage = null;
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === "assistant" && 
            msg.agentTraces && 
            Array.isArray(msg.agentTraces) && 
            msg.agentTraces.length > 0) {
          lastAssistantMessage = msg;
          break;
        }
      }
      
      if (lastAssistantMessage) {
        selectMessageForContext(lastAssistantMessage.id, lastAssistantMessage.sources, lastAssistantMessage.agentTraces as any[]);
      }
    }
  }, [isLoadingChatHistory, messages, selectedMessageId, selectMessageForContext]);

  // Scroll to bottom when chat selection changes and loading completes
  useEffect(() => {
    if (!isLoadingChatHistory && sessionId && messages && messages.length > 0) {
      // Use immediate scroll for chat switching, no animation to make it feel instant
      const timer = setTimeout(() => {
        if (messagesEndRef.current) {
          // First try scrollIntoView with instant behavior
          messagesEndRef.current.scrollIntoView({ behavior: "instant", block: "end" });
          
          // Also try direct scroll on the parent container as fallback
          const scrollArea = messagesEndRef.current.closest('[data-radix-scroll-area-viewport]');
          if (scrollArea) {
            scrollArea.scrollTop = scrollArea.scrollHeight;
          }
        }
      }, 50);
      
      // Additional delayed scroll to ensure it happens after animations
      const delayedTimer = setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
        }
      }, 400); // Wait for animations to complete
      
      return () => {
        clearTimeout(timer);
        clearTimeout(delayedTimer);
      };
    }
  }, [isLoadingChatHistory, sessionId, messages]);

  // Safe background preloading - RUNS ONLY ONCE after initial app load
  useEffect(() => {
    // CRITICAL: Check ref immediately to prevent re-runs
    if (hasPreloadedRef.current) return;
    
    const preloadSessions = async () => {
      // Wait 5 seconds after app load before preloading
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Double-check we haven't already preloaded (e.g., if effect re-ran)
      if (hasPreloadedRef.current) return;
      
      // Mark as preloaded BEFORE starting
      hasPreloadedRef.current = true;
      
      const sessions = queryClient.getQueryData<any[]>(["chat-sessions", userId]);
      if (!sessions || sessions.length === 0) return;
      
      const recentSessions = sessions.slice(0, 5);
      
      for (const session of recentSessions) {
        try {
          if (session.id !== sessionId) {
            await fetchChatSessionHistory(session.id);
          }
        } catch (error) {
          console.error('[PRELOAD] Failed for session:', session.id, error);
          break;
        }
      }
    };
    
    // Defer preload to avoid blocking initial render
    setTimeout(preloadSessions, 0);
  }, []); // NO DEPENDENCIES - runs once only
  
  // 🔧 CLEANUP: Clear any pending debounce timers on unmount
  useEffect(() => {
    return () => {
      if (sidebarRefetchDebounceRef.current) {
        clearTimeout(sidebarRefetchDebounceRef.current);
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Check if the app is still loading initial data
  const isInitialLoading = !isAppInitialized || isLoadingChatSessions || isLoadingDocuments;

  // Show loading screen while initial data is being fetched
  if (isInitialLoading) {
    return (
      <div className="flex h-screen bg-background text-foreground relative overflow-hidden transition-colors duration-300">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <LoadRipple />
            <div className="mt-6 space-y-2">
              <h2 className="text-xl font-semibold text-foreground">
                Getting things ready
              </h2>
              <p className="text-sm text-muted-foreground">
                Setting up your workspace...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
        onSettingsClick={() => {
          setIsSettingsOpen(true);
        }}
        onUpdateRole={handleUpdateRole}
        onLogout={handleLogout}
        isLoadingChat={isLoadingChatHistory}
        loadingChatId={loadingChatId}
      />

      {/* Main Content */}
      <div className={cn(
        "flex flex-col flex-1 min-w-0",
        isMobile && "w-full" // Ensure full width on mobile
      )}>
        <Header 
          onSettingsClick={() => setIsSettingsOpen(true)}
          onMenuClick={handleSidebarToggle}
          documents={documents}
          onRefreshDocuments={handleRefreshDocuments}
          onDeleteDocument={handleDeleteDocument}
        />

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0">

            <ScrollArea className={cn(
              "flex-1",
              //  Add bottom padding to account for fixed input bar
              isMobile && "pb-[140px]" // Approximate height of fixed input + padding
            )}>
              <div className={cn(
                "max-w-4xl mx-auto px-3 py-4 sm:px-4 sm:py-6",
                // For empty state, ensure container takes available height and prevents scrolling
                !shouldShowChatView && !pendingUserMessage && [
                  "h-full flex items-center justify-center",
                  "min-h-[calc(100vh-16rem)]" // Account for header and input areas
                ]
              )}>
                <AnimatePresence mode="wait">
                  {isLoadingChatHistory && loadingChatId ? (
                    <motion.div 
                      key="loading-chat"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="h-full flex items-center justify-center min-h-[calc(100vh-16rem)]"
                    >
                      <OrbitalLoader 
                        message="Loading conversation..."
                        messagePlacement="bottom"
                        className="w-20 h-20"
                      />
                    </motion.div>
                  ) : !shouldShowChatView && !pendingUserMessage ? (
                    (() => {
                      return (
                        <div className="w-full">
                          <EmptyState 
                            uploadedDocuments={documents}
                          />
                        </div>
                      );
                    })()
                  ) : (
                    (() => {
                      return (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="space-y-4 sm:space-y-6"
                        >
                      {/*  Disable animations during streaming to prevent layout thrashing */}
                      <AnimatePresence mode="popLayout" initial={false}>
                        {messages.map((message: Message, index: number) => {
                          // For assistant messages, check if this is the most recent assistant message
                          const isLastAssistantMessage = message.role === "assistant" && 
                            index === messages.length - 1;
                          
                          // Check if this message should show refined queries (using clientId)
                          const messageShowsRefined = shouldShowRefinedQueries(message, refinedQueriesFor);
                          
                          // Use stable message ID as key (remains constant even when server updates come in)
                          // This prevents React from remounting when optimistic messages are confirmed
                          const messageKey = message.id;
                          
                          // Skip animation for optimistic messages OR during streaming
                          const isOptimistic = messageKey.startsWith('optimistic-');
                          const shouldAnimate = !isOptimistic && !isStreaming;
                          
                          return (
                            <motion.div
                              key={messageKey}
                              initial={shouldAnimate ? { opacity: 0, y: 20 } : { opacity: 1, y: 0 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={shouldAnimate ? { duration: 0.3 } : { duration: 0 }}
                            >
                              <MessageBubble
                                message={message}
                                responseType={isLastAssistantMessage ? currentResponseType : undefined}
                                selected={selectedMessageId === message.id}
                                onCitationClick={handleCitationClick}
                                onMessageClick={selectMessageForContext}
                                refinedQueries={messageShowsRefined ? refinedQueries : undefined}
                                showRefinedQueries={messageShowsRefined}
                                onRefinedQueryClick={handleRefinedQueryClick}
                                sessionId={sessionId}
                                userAvatar={userProfile.avatar}
                                userName={userProfile.name}
                              />
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                      
                      <AnimatePresence>
                        {showTypingIndicator && (
                          <TypingIndicator />
                        )}
                      </AnimatePresence>
                      
                      <div ref={messagesEndRef} />
                    </motion.div>
                      );
                    })()
                  )}
                </AnimatePresence>
              </div>
            </ScrollArea>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex-shrink-0 border-t border-border bg-background",
                // Use fixed positioning on mobile to stay above keyboard
                isMobile && [
                  "fixed bottom-0 left-0 right-0 z-50",
                  "shadow-[0_-4px_16px_rgba(0,0,0,0.1)]",
                  "dark:shadow-[0_-4px_16px_rgba(0,0,0,0.3)]"
                ]
              )}
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
                  documents={documents}
                  selectedDocumentIds={selectedDocumentIds}
                  onDocumentSelectionChange={handleDocumentSelectionChange}
                  onQuotaExhausted={() => setIsQuotaModalOpen(true)}
                />
              </div>
            </motion.div>
          </div>

          {/* Context Panel - Hidden on mobile */}
          {!isMobile && (
            <div className={`border-l border-border bg-card transition-all duration-300 ${isContextPanelVisible ? 'w-96' : 'w-0'}`}>
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
                isVisible={isContextPanelVisible}
                onToggleVisibility={() => setIsContextPanelVisible(!isContextPanelVisible)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Quota Exhausted Modal */}
      <QuotaExhaustedModal
        isOpen={isQuotaModalOpen}
        onClose={() => setIsQuotaModalOpen(false)}
        onAddApiKey={() => {
          setIsQuotaModalOpen(false);
          setIsSettingsOpen(true);
          // TODO: Auto-scroll to personal key section in settings
        }}
        quotaLimit={50}
      />
    </div>
  );
}
