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
import { apiRequest } from "@/lib/queryClient";
import { apiRequest as enhancedApiRequest, API_ENDPOINTS } from "@/lib/api-config";
import { queryClient } from "@/lib/queryClient";
import { applyEventToCache, shouldShowRefinedQueries, mergeServerHistoryIntoCache } from "@/lib/chat-cache";
import { cn } from "@/lib/utils";
import { Settings, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCachedChatHistory, useCachedDocuments } from "@/hooks/use-cached-api";
import { useCacheStore } from "@/stores/cache-store";

export default function Chat() {
  const isMobile = useIsMobile();
  const { user } = useUser();
  const userId = useAuthUserId();
  
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
  
  // Direct cache store access for immediate cache checks
  const getChatSessionHistory = useCacheStore((state) => state.getChatSessionHistory);
  
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
      // userId is now validated server-side from JWT token
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
      const sessions = response.sessions.map(session => ({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        messageCount: session.messageCount,
      }));
      
      return sessions;
    },
    enabled: !!userId, // Only fetch when userId is available
    staleTime: 30 * 1000, // Mark stale after 30 seconds
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: true, // Refresh when user returns to tab
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
  const hasPreloadedRef = useRef<boolean>(false);
  const activeSessionRef = useRef<string | undefined>(undefined); // ✅ Track active session for race condition prevention
  const { toast } = useToast();

  // Select a message to display its traces in context panel (defined early for use in mutations)
  const selectMessageForContext = useCallback((messageId: string, sources?: Message["sources"], agentTraces?: any[]) => {
    setSelectedMessageId(messageId);
    setCurrentSources(sources);
    setSelectedSourceIndex(undefined);
    
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
      
      // ✅ CRITICAL FIX: Preserve refined queries during refetch
      // Get the current cache BEFORE fetching to preserve client-side data
      const currentCache = queryClient.getQueryData<{ 
        messages: Message[]; 
        refinedQueriesFor?: string; 
        refinedQueries?: string[] 
      }>(["chat-history", sessionId]);
      
      // Fetch fresh messages from server
      const serverMessages = await fetchChatSessionHistory(sessionId);
      const mergedMessages = mergeServerHistoryIntoCache(currentCache?.messages || [], serverMessages);
      
      // ✅ PRESERVE refined queries from cache (they're client-side only, not from server)
      return { 
        messages: mergedMessages,
        refinedQueriesFor: currentCache?.refinedQueriesFor, // Preserve from cache
        refinedQueries: currentCache?.refinedQueries,       // Preserve from cache
      };
    },
    enabled: !!sessionId,
    staleTime: 30 * 1000, // ✅ Mark stale after 30 seconds for background revalidation
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: true, // ✅ Revalidate when tab regains focus
    refetchOnReconnect: true, // ✅ Revalidate when network reconnects
    // ❌ Removed placeholderData: keepPreviousData - it was preventing isLoading from being true
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
    refetchOnWindowFocus: true, // Refresh when user returns
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
      const response = await enhancedApiRequest<QueryResponse>(API_ENDPOINTS.QUERY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          sessionId,
          // userId now validated server-side from JWT token
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

      // ❌ REMOVED: Don't invalidate queries - it clears refined queries
      // The cache is already updated via applyEventToCache during streaming
      // For non-streaming queries (rare), the cache update happens in queryMutation.onSuccess
      // if (!isStreaming) {
      //   setTimeout(() => {
      //     queryClient.invalidateQueries({ queryKey: ["chat-history", data.sessionId] });
      //     invalidateSession(data.sessionId);
      //   }, 500);
      // }

      // ❌ REMOVED: Don't refetch sessions here - only refetch after title_update event
      // This prevents redundant fetches before the title is even generated
      // refetchChatSessions();
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
    // console.log('[STREAM] handleStreamingQuery called with query:', query.substring(0, 50));
    
    const streamSessionId = getSessionId(); // Capture session at stream start
    if (!streamSessionId) {
      // console.error('[STREAM] No session ID available');
      throw new Error("Cannot stream without a session");
    }
    
    console.log('[STREAM] Session ID:', streamSessionId);

    let accumulatedContent = "";
    let hasReceivedRefinement = false;
    let refinementTimeout: NodeJS.Timeout | null = null;

    try {
      console.log('[STREAM] Initiating fetch to:', API_ENDPOINTS.QUERY_STREAM);
      console.log('[STREAM] Request body:', {
        query,
        sessionId: streamSessionId.startsWith('temp-session-') ? undefined : streamSessionId,
        topK: 5,
        enableTracing,
        debugMode,
        documentIds,
      });
      
      const response = await fetch(API_ENDPOINTS.QUERY_STREAM, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // ✅ CRITICAL: Required to send JWT authentication cookie
        body: JSON.stringify({
          query,
          sessionId: streamSessionId.startsWith('temp-session-') ? undefined : streamSessionId,
          topK: 5,
          enableTracing,
          debugMode,
          documentIds,
        }),
      });

      // console.log('[STREAM] Fetch completed, response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[STREAM] ❌ HTTP error response body:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get response reader");
      }

      // Set timeout for refinement (5 seconds max wait - reduced from 10s)
      refinementTimeout = setTimeout(() => {
        if (!hasReceivedRefinement) {
          console.warn('[STREAM] ⏱️ Refinement timeout - proceeding without refined questions');
          hasReceivedRefinement = true;
        }
      }, 5000); // Reduced from 10000ms to 5000ms

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
                  const currentSession = getSessionId();
                  if (currentSession && data.data.messageId) {
                    applyEventToCache(queryClient, {
                      type: "chunk",
                      sessionId: currentSession,
                      assistantServerId: data.data.messageId,
                      append: contentChunk
                    });
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
                  
                  console.log('[STREAM] Refinement received:', {
                    userMessageId: data.data.userMessageId,
                    count: refinedQueries.length,
                    status: data.data.status
                  });

                  // Only apply if we have valid queries
                  if (refinedQueries.length > 0) {
                    applyEventToCache(queryClient, {
                      type: "refinement",
                      sessionId: currentSession,
                      userMessageId: data.data.userMessageId,
                      refined: refinedQueries
                    });

                    // REMOVED: invalidateQueries mid-stream
                    // Instead, just scroll to show the new content
                    setTimeout(() => {
                      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                    }, 50);
                  } else {
                    console.log('[STREAM] Refinement skipped:', data.data.status);
                  }
                }
              } 
              
              else if (data.type === "completion") {
                if (pendingUserMessage) {
                  setPendingUserMessage(null);
                }

                const currentSession = getSessionId();
                if (currentSession && data.data.messageId && data.data.userMessageId) {
                  const messageContent = accumulatedContent || data.data.answer || data.data.content || data.data.response || "[No content received]";
                  
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

                  // ✅ Hide typing indicator immediately on completion
                  setShowTypingIndicator(false);

                  if (data.data.messageId) {
                    selectMessageForContext(data.data.messageId, data.data.sources, data.data.agentTraces);
                  } else {
                    setCurrentAgentTraces(data.data.agentTraces);
                  }

                  // ✅ NO invalidation needed - cache already updated via applyEventToCache
                  // Invalidating causes refetch which clears client-side refinedQueries
                  
                  // ❌ REMOVED: Don't refetch sessions here - wait for title_update event
                  // This prevents redundant fetches during streaming query completion
                  // refetchChatSessions();
                }
              } 
              
              else if (data.type === "title_update") {
                // ✅ ONLY refetch sessions when title is actually updated
                refetchChatSessions();
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
      console.error('[STREAM] ❌ Streaming query failed with error:', error);
      console.error('[STREAM] 📋 Error details:', {
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
      if (refinementTimeout) {
        clearTimeout(refinementTimeout);
      }
      setIsStreaming(false);
    }
  };

  const handleSubmit = async (content: string, documentIds: string[] = []) => {
    if (!content.trim()) return;

    console.log("[SUBMIT] User submitted message:", {
      messageLength: content.length,
      hasDocumentIds: documentIds.length > 0,
      currentSessionId: sessionId,
      timestamp: new Date().toISOString()
    });

    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    // console.log("[SUBMIT] Generated optimistic ID:", optimisticId);

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
      console.log("[SUBMIT] Creating new temp session:", tempSessionId);
      setSession(tempSessionId);
      
      queryClient.setQueryData(
        ["chat-history", tempSessionId],
        {
          messages: [optimisticMessage],
          refinedQueriesFor: undefined, // Initialize structure
          refinedQueries: undefined,    // Initialize structure
        }
      );
      // console.log("[SUBMIT] Optimistic message added to cache (new session)");
    } else {
      // Add optimistic message to existing session
      queryClient.setQueryData(
        ["chat-history", sessionId],
        (old?: { messages: Message[]; refinedQueriesFor?: string; refinedQueries?: string[] }) => {
          // console.log("[SUBMIT] Cache before update:", {
          //   messageCount: old?.messages?.length,
          //   refinedQueriesFor: old?.refinedQueriesFor
          // });
          
          // ✅ Clear old refined queries when new message is sent (they're only for the latest question)
          const result = {
            messages: [...(old?.messages ?? []), optimisticMessage],
            refinedQueriesFor: undefined, // Clear old refined queries
            refinedQueries: undefined,    // Will be set by new refinement event
          };
          
          // console.log("[SUBMIT] Optimistic message added to cache (existing session):", {
          //   newMessageCount: result.messages.length
          // });
          
          return result;
        }
      );
    }

    // console.log("[SUBMIT] Starting streaming query...");
    setIsStreaming(true);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    // console.log("[SUBMIT] Scrolled to bottom, anchor set");
    
    // Use streaming query with error handling
    try {
      await handleStreamingQuery(content, documentIds.length > 0 ? documentIds : undefined);
    } catch (error) {
      // ✅ Rollback optimistic update on error
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
    
    // Also select this message for the context panel to show its agent traces
    selectMessageForContext(messageId, messageSources, agentTraces);
  };

  const handleSamplePromptClick = (prompt: string) => {
    handleSubmit(prompt);
  };

  const handleDeleteDocument = async (documentId: string) => {
    await deleteMutation.mutateAsync(documentId);
  };

  const handleRefreshDocuments = () => {
    refreshDocuments();
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

  const handleChatSelect = async (chatId: string) => {
    if (isStreaming) {
      toast({
        title: "Please wait",
        description: "A message is being processed. Please wait before switching chats.",
      });
      return;
    }

    if (sessionId === chatId && !isLoadingChatHistory) {
      return;
    }

    // ✅ Set active session immediately to prevent race conditions
    activeSessionRef.current = chatId;

    setIsLoadingChatHistory(true);
    setLoadingChatId(chatId);

    // Clear current session data (preserve structure with refined queries)
    if (sessionId && sessionId !== chatId) {
      const previousCache = queryClient.getQueryData<{ 
        messages: Message[]; 
        refinedQueriesFor?: string; 
        refinedQueries?: string[] 
      }>(["chat-history", sessionId]);
      
      // ✅ Preserve refined queries even when clearing messages for UI
      queryClient.setQueryData(["chat-history", sessionId], { 
        messages: [],
        refinedQueriesFor: previousCache?.refinedQueriesFor,
        refinedQueries: previousCache?.refinedQueries,
      });
    }

    // Clear current context
    setCurrentSources(undefined);
    setCurrentClassification(undefined);
    setCurrentAgentTraces(undefined);
    setCurrentExecutionTime(undefined);
    setCurrentResponseType(undefined);

    // ✅ FIX 7: Use React Query as single source of truth
    // Check React Query cache first (primary cache)
    const reactQueryCache = queryClient.getQueryData<{ messages: Message[] }>(["chat-history", chatId]);
    
    if (reactQueryCache?.messages && reactQueryCache.messages.length > 0) {
      // Data exists in React Query - use it directly
      setSession(chatId);
      
      // Trigger background refetch for freshness
      queueMicrotask(() => {
        queryClient.refetchQueries({
          queryKey: ["chat-history", chatId],
          exact: true,
        }).catch(error => {
          console.warn('[BACKGROUND REFRESH] Failed for', chatId, error);
        });
      });
    } else {
      // No React Query cache - try Zustand as fallback for instant display
      const cachedHistory = getChatSessionHistory(chatId);
      
      if (cachedHistory && Array.isArray(cachedHistory) && cachedHistory.length > 0) {
        // Sync Zustand cache to React Query immediately (preserve structure)
        queryClient.setQueryData(["chat-history", chatId], { 
          messages: cachedHistory,
          refinedQueriesFor: undefined, // Will be set by refinement event
          refinedQueries: undefined,    // Will be set by refinement event
        });
        setSession(chatId);

        // Refresh in background
        queueMicrotask(() => {
          fetchChatSessionHistory(chatId, true).then(freshHistory => {
            // ✅ Only update if this chat is still the active one (prevents race condition)
            if (activeSessionRef.current !== chatId) {
              console.log('[RACE PROTECTION] Skipping stale update for', chatId);
              return;
            }

            // Lightweight comparison: check length and last message id
            const shouldUpdate = freshHistory.length !== cachedHistory.length || 
              (freshHistory.length > 0 && cachedHistory.length > 0 && 
               freshHistory[freshHistory.length - 1]?.id !== cachedHistory[cachedHistory.length - 1]?.id);
            
            if (shouldUpdate) {
              // ✅ Preserve refined queries during background refresh
              const currentData = queryClient.getQueryData<{ 
                messages: Message[]; 
                refinedQueriesFor?: string; 
                refinedQueries?: string[] 
              }>(["chat-history", chatId]);
              
              queryClient.setQueryData(["chat-history", chatId], { 
                messages: freshHistory,
                refinedQueriesFor: currentData?.refinedQueriesFor, // Preserve
                refinedQueries: currentData?.refinedQueries,       // Preserve
              });
            }
          }).catch(error => {
            // Background refresh failed - not critical
            console.warn('[BACKGROUND REFRESH] Failed for', chatId, error);
          });
        });
      } else {
        // No cache available - set session and let React Query handle loading
        console.log('[CHAT SELECT] No cache available, setting session and triggering fetch');
        setSession(chatId);
        // React Query's useQuery hook will automatically fetch when sessionId changes
        // The loading state will be handled by isLoadingHistory
      }
    }

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

    // ✅ Clear active session ref for new chat
    activeSessionRef.current = undefined;

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

    refetchChatSessions();
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
  // ✅ Include isLoadingHistory to prevent empty state flash during chat switching
  const shouldShowChatView = hasMessages || isStreaming || queryMutation.isPending || isLoadingHistory;
  const documents = (documentsData as any[] | undefined) || [];

  // 🔍 DEBUG: Track re-renders and cache state changes
  useEffect(() => {
  //   console.log('[RENDER] Chat component re-rendered:', {
  //     sessionId,
  //     messageCount: messages.length,
  //     refinedQueriesFor,
  //     refinedQueriesCount: refinedQueries.length,
  //     isStreaming,
  //     isLoadingHistory,
  //     hasMessages,
  //     shouldShowChatView,
  //     chatHistoryData: chatHistory ? 'present' : 'null',
  //     timestamp: new Date().toISOString()
  //   });
  });

  // 🔍 DEBUG: Track shouldShowChatView transitions (flicker detector)
  useEffect(() => {
    console.log('[STATE] shouldShowChatView changed:', {
      shouldShowChatView,
      hasMessages,
      messageCount: messages.length,
      isStreaming,
      isLoadingHistory,
      isPending: queryMutation.isPending,
      calculation: `${hasMessages} || ${isStreaming} || ${queryMutation.isPending} || ${isLoadingHistory} = ${shouldShowChatView}`
    });
  }, [shouldShowChatView, hasMessages, messages.length, isStreaming, isLoadingHistory, queryMutation.isPending]);

  // 🔍 DEBUG: Track messages array changes (potential flicker source)
  useEffect(() => {
    if (messages.length > 0) {
      // console.log(' [MESSAGES] Messages array updated:', {
      //   count: messages.length,
      //   sessionId,
      //   messages: messages.map(m => ({
      //     id: m.id,
      //     serverId: m.serverId,
      //     role: m.role,
      //     contentPreview: m.content.substring(0, 30) + '...'
      //   }))
      // });
    } else if (sessionId && !isLoadingHistory && chatHistory) {
      // Only warn if session exists, not loading, and we have chatHistory data but no messages
      // This indicates a potential issue (not just normal loading state)
      console.warn(' [MESSAGES] Messages array is EMPTY but session exists!', {
        sessionId,
        chatHistoryData: chatHistory ? 'present' : 'null',
        isLoadingHistory
      });
    }
  }, [messages, sessionId, isLoadingHistory, chatHistory]);

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
      enhancedApiRequest(API_ENDPOINTS.DELETE_CHAT_SESSION(chatId), {
        method: "DELETE",
      })
        .then(() => {
          // Sync with backend to ensure consistency
          refetchChatSessions();
        })
        .catch(error => {
          console.error("Failed to delete chat:", error);
          
          // Revert optimistic update on failure
          refetchChatSessions();
          
          toast({
            title: "Delete failed", 
            description: error instanceof Error ? error.message : "Failed to delete the conversation.",
            variant: "destructive",
          });
        });
        
    } catch (error) {
      console.error("Failed to delete chat:", error);
      
      // Revert optimistic update and show error
      refetchChatSessions();
      
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
  useEffect(() => {
    let lastVisibilityChange = Date.now();
    let healthCheckInterval: NodeJS.Timeout | null = null;
    
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const idleTime = Date.now() - lastVisibilityChange;
        
        // If tab was hidden for more than 30 seconds, force revalidation
        if (idleTime > 30 * 1000) {
          // console.log(`[VISIBILITY] Tab was idle for ${Math.round(idleTime / 1000)}s - revalidating cache`);
          
          // Use refetchQueries instead of invalidateQueries for stale-while-revalidate pattern
          // This shows stale data immediately while fetching fresh data in background
          if (sessionId && !sessionId.startsWith('temp-session-')) {
            queryClient.refetchQueries({
              queryKey: ["chat-history", sessionId],
              exact: true,
            });
          }
          
          // Also revalidate chat sessions list
          queryClient.refetchQueries({
            queryKey: ["chat-sessions"],
            exact: true,
          });
          
          // Revalidate documents
          queryClient.refetchQueries({
            queryKey: ["documents"],
            exact: true,
          });
        }
        
        // Start periodic health check when tab is active
        if (!healthCheckInterval) {
          healthCheckInterval = setInterval(() => {
            // Check if cache is stale every 60 seconds when tab is active
            if (sessionId && !sessionId.startsWith('temp-session-')) {
              const cacheData = queryClient.getQueryState(["chat-history", sessionId]);
              const cacheAge = cacheData?.dataUpdatedAt ? Date.now() - cacheData.dataUpdatedAt : Infinity;
              
              // If cache is older than 2 minutes, refetch with stale-while-revalidate
              if (cacheAge > 2 * 60 * 1000) {
                // console.log('[HEALTH] Cache is stale, refreshing in background...');
                queryClient.refetchQueries({
                  queryKey: ["chat-history", sessionId],
                  exact: true,
                });
              }
            }
          }, 60 * 1000); // Check every 60 seconds
        }
      } else {
        // Tab hidden - stop health checks
        if (healthCheckInterval) {
          clearInterval(healthCheckInterval);
          healthCheckInterval = null;
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
    };
  }, [sessionId]);

  // Deferred typing indicator to prevent flicker before optimistic message paints
  useEffect(() => {
    if (isStreaming) {
      const timer = setTimeout(() => setShowTypingIndicator(true), 50);
      return () => clearTimeout(timer);
    } else {
      // ✅ Hide typing indicator immediately when streaming stops (no delay)
      setShowTypingIndicator(false);
    }
  }, [isStreaming]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, queryMutation.isPending, pendingUserMessage]);

  // Additional effect to ensure scrolling when chat loads
  useEffect(() => {
    if (messages && messages.length > 0 && !isLoadingHistory) {
      // Use a small timeout to ensure the DOM is updated
      const timer = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [messages, isLoadingHistory]);

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

  // Safe background preloading - only once after initial app load
  useEffect(() => {
    const preloadSessions = async () => {
      if (hasPreloadedRef.current || !chatSessions || chatSessions.length === 0) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 5000));

      if (hasPreloadedRef.current || isStreaming || pendingUserMessage || queryMutation.isPending) {
        return;
      }

      hasPreloadedRef.current = true;

      const recentSessions = chatSessions.slice(0, 5);

      for (const session of recentSessions) {
        try {
          if (session.id !== sessionId) {
            await fetchChatSessionHistory(session.id);
          }
        } catch (error) {
          break;
        }
      }
    };

    preloadSessions();
  }, [chatSessions]);

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
        onSettingsClick={() => setIsSettingsOpen(true)}
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

            <ScrollArea className="flex-1">
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
                      // console.log('[VIEW] Showing EmptyState:', {
                      //   shouldShowChatView,
                      //   hasMessages,
                      //   messageCount: messages.length,
                      //   isStreaming,
                      //   pendingUserMessage,
                      //   sessionId
                      // });
                      return (
                        <div className="w-full">
                          <EmptyState 
                            onSamplePromptClick={handleSamplePromptClick}
                            uploadedDocuments={documents}
                          />
                        </div>
                      );
                    })()
                  ) : (
                    (() => {
                      // console.log('[VIEW] Showing ChatView:', {
                      //   shouldShowChatView,
                      //   hasMessages,
                      //   messageCount: messages.length,
                      //   isStreaming,
                      //   pendingUserMessage,
                      //   sessionId,
                      //   refinedQueriesFor,
                      //   refinedQueriesCount: refinedQueries.length
                      // });
                      return (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="space-y-4 sm:space-y-6"
                        >
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
                          
                          // Skip animation for optimistic messages (user just typed them)
                          const isOptimistic = messageKey.startsWith('optimistic-');
                          
                          return (
                            <motion.div
                              key={messageKey}
                              initial={isOptimistic ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: isOptimistic ? 0 : 0.3 }}
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
                  documents={documents}
                  selectedDocumentIds={selectedDocumentIds}
                  onDocumentSelectionChange={handleDocumentSelectionChange}
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
