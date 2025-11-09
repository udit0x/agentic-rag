import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Message, type QueryResponse, type QueryClassification, type AgentTrace, type Document } from "@shared/schema";
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
import { apiRequest } from "@/lib/queryClient";
import { apiRequest as enhancedApiRequest, API_ENDPOINTS } from "@/lib/api-config";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Settings, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCachedChatHistory, useCachedDocuments } from "@/hooks/use-cached-api";
import { useCacheStore } from "@/stores/cache-store";

export default function Chat() {
  const isMobile = useIsMobile();
  
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
      const sessions = response.sessions.map(session => ({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        messageCount: session.messageCount,
      }));
      
      return sessions;
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
  const [selectedMessageId, setSelectedMessageId] = useState<string | undefined>(); // Track which message is active in context panel
  const [currentSources, setCurrentSources] = useState<Message["sources"]>();
  const [currentClassification, setCurrentClassification] = useState<QueryClassification | undefined>();
  const [currentAgentTraces, setCurrentAgentTraces] = useState<AgentTrace[] | undefined>();
  const [currentExecutionTime, setCurrentExecutionTime] = useState<number | undefined>();
  const [currentResponseType, setCurrentResponseType] = useState<string | undefined>();
  const [enableTracing, setEnableTracing] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sessionLocked, setSessionLocked] = useState(false); // 🔒 Prevent navigation during streaming
  const [refinedQueries, setRefinedQueries] = useState<string[]>([]);
  const [showRefinedQueries, setShowRefinedQueries] = useState(false);
  const [refinedQueriesMessageId, setRefinedQueriesMessageId] = useState<string | undefined>(); // Track which message triggered refined queries
  const [isStreaming, setIsStreaming] = useState(false);
  
  // 🐛 DEBUG: Log sessionId changes
  useEffect(() => {
    //console.log('sessionId changed:', sessionId);
  }, [sessionId]);
  
  // 🐛 DEBUG: Log streaming state changes
  useEffect(() => {
  }, [isStreaming]);
  
  // 🐛 DEBUG: Log sessionLocked state changes
  useEffect(() => {
    //console.log('sessionLocked changed:', sessionLocked);
  }, [sessionLocked]);
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
  const activeUserMessageIdRef = useRef<string | undefined>();
  const messageIdMap = useRef<Record<string, string>>({});
  const hasPreloadedRef = useRef<boolean>(false);
  const { toast } = useToast();

  const { data: chatHistory, isLoading: isLoadingHistory } = useQuery({
    queryKey: ["chat-history", sessionId],
    queryFn: async () => {
      if (!sessionId) {
        console.log('📭 Query disabled - sessionId is undefined, returning null');
        return null;
      }
      
      // 🔧 FIX: For temp sessions, check cache first (messages are added optimistically)
      if (sessionId.startsWith('temp-session-')) {
        // Check if we have cached data for this temp session
        const cachedData = queryClient.getQueryData<{ messages: Message[] }>(["chat-history", sessionId]);
        if (cachedData) {
          // Return cached data immediately - this shows the chat window
          // console.log('Using cached data for temp session:', { sessionId, messageCount: cachedData.messages?.length || 0 });
          return cachedData;
        }
        // If no cached data, return empty array (will be populated when user submits)
        console.log('⚠️ No cached data for temp session:', sessionId);
        return { messages: [] };
      }
      
      // Use cached chat session history with fallback to API for real sessions
      const messages = await fetchChatSessionHistory(sessionId);
      return { messages };
    },
    enabled: !!sessionId,
    staleTime: 0, // Always consider data stale so cache invalidation works immediately
    gcTime: 60 * 60 * 1000, // 1 hour (renamed from cacheTime in v5)
    // CRITICAL: Use placeholderData to immediately show cached messages when sessionId changes
    // This ensures the UI updates instantly when we set cache data and then change sessionId
    placeholderData: (previousData, previousQuery) => {
      // 🚀 FIX: When sessionId is undefined, return null to show empty state
      if (!sessionId) {
        // console.log('placeholderData - sessionId undefined, returning null');
        return null;
      }
      // Check cache for immediate data - this is synchronous and happens before queryFn runs
      const cached = queryClient.getQueryData<{ messages: Message[] }>(["chat-history", sessionId]);
      if (cached) {
        // console.log(' placeholderData found cached data:', { sessionId, messageCount: cached.messages?.length || 0 });
        return cached;
      }
      return previousData;
    },
    // 🚀 CRITICAL: Use select to ensure data is null when sessionId is undefined
    // This forces the UI to update even when query is disabled
    select: (data) => {
      if (!sessionId) {
        // console.log(' select - sessionId undefined, returning null');
        return null;
      }
      return data;
    },
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
    queryKey: ["documents"],
    queryFn: () => fetchDocuments(),
    staleTime: 5 * 60 * 1000, // 5 minutes - matches cache TTL
    gcTime: 10 * 60 * 1000, // 10 minutes (renamed from cacheTime in v5)
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
      setCurrentExecutionTime(data.executionTimeMs);
      setCurrentResponseType(data.responseType);
      
      // Automatically select the new assistant message for context panel
      if (data.messageId) {
        selectMessageForContext(data.messageId, data.sources, (data.agentTraces || []));
      } else {
        // Fallback if no messageId provided
        setCurrentAgentTraces((data.agentTraces || []) as unknown as AgentTrace[]);
      }
      
      // 🔄 Immediate cache refresh for non-streaming responses
      // Streaming responses have their own cache invalidation in finally block
      if (!isStreaming) {
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["chat-history", data.sessionId] });
          invalidateSession(data.sessionId);
        }, 500);
      }
      
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
  const handleStreamingQuery = async (query: string, overrideSessionId?: string | null, documentIds?: string[], targetUserMessageId?: string) => {
    // 🚀 OPTIMIZATION: If overrideSessionId is explicitly null, don't use state sessionId
    // This allows backend to create a new session immediately without looking up temp sessions
    const effectiveSessionId = overrideSessionId === null ? undefined : (overrideSessionId || sessionId);
    
    // 🚀 Capture current sessionId at call time for session migration (handles React state batching)
    const currentSessionIdAtCall = sessionId;
    const tempSessionIdToMigrate = (currentSessionIdAtCall?.startsWith('temp-session-') ? currentSessionIdAtCall : null) ||
                                   (effectiveSessionId?.startsWith('temp-session-') ? effectiveSessionId : null);
    
    if (!targetUserMessageId) {
      throw new Error("targetUserMessageId missing — must be passed explicitly to prevent race conditions");
    }
    
    // 🔄 State to accumulate streaming content
    let accumulatedContent = "";
    let currentMessageId = "";
    
    setSessionLocked(true); // Lock session at start
    setIsStreaming(true);
    setRefinedQueries([]);
    setShowRefinedQueries(false);
    
    // Set session ID immediately if we have an effectiveSessionId (for new sessions)
    if (effectiveSessionId && !sessionId) {
      setSessionId(effectiveSessionId);
    }
    
    // Always use the explicitly passed message ID - never rely on async state lookup
    setRefinedQueriesMessageId(targetUserMessageId);
    activeUserMessageIdRef.current = targetUserMessageId;
    
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
          documentIds, // Include document filter
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
              //console.log('Streaming event received:', { type: data.type, keys: Object.keys(data.data || {}) });
              
              if (data.type === "started") {
                // OPTIMIZATION: Backend acknowledged and created session - update immediately
                if (data.data.sessionId && tempSessionIdToMigrate) {
                  const realSessionId = data.data.sessionId;
                  // console.log('Real session ID received in started event:', {
                  //   tempSessionId: tempSessionIdToMigrate,
                  //   realSessionId: realSessionId
                  // });
                  
                  // Update session ID immediately for faster UI updates
                  setSessionId(realSessionId);
                  
                  // Migrate messages from temp session to real session
                  queryClient.setQueryData(["chat-history", realSessionId], (oldData: { messages: Message[] } | undefined) => {
                    const tempData = queryClient.getQueryData(["chat-history", tempSessionIdToMigrate]) as { messages: Message[] } | undefined;
                    if (tempData?.messages) {
                      // Migrate messages and update their session IDs
                      const migratedMessages = tempData.messages.map(msg => ({
                        ...msg,
                        sessionId: realSessionId
                      }));
                      // Merge with any existing messages (shouldn't be any, but just in case)
                      const existingMessages = oldData?.messages || [];
                      const allMessages = [...existingMessages, ...migratedMessages];
                      // Dedupe by message ID
                      const uniqueMessages = Array.from(
                        new Map(allMessages.map(msg => [msg.id, msg])).values()
                      );
                      return { messages: uniqueMessages };
                    }
                    return oldData || { messages: [] };
                  });
                  
                  // Clean up temp session cache
                  queryClient.removeQueries({ queryKey: ["chat-history", tempSessionIdToMigrate] });
                }
              } else if (data.type === "token" || data.type === "chunk" || data.type === "content") {
                // Handle streaming content chunks
                if (data.data.content || data.data.token || data.data.chunk) {
                  const contentChunk = data.data.content || data.data.token || data.data.chunk;
                  accumulatedContent += contentChunk;
                  console.log('📝 Streaming content chunk received:', { 
                    type: data.type, 
                    chunkLength: contentChunk.length,
                    totalLength: accumulatedContent.length 
                  });
                }
                if (data.data.messageId) {
                  currentMessageId = data.data.messageId;
                }
              } else if (data.type === "refinement") {
                // Handle refined questions - show immediately when they arrive
                
                // Use backend provided user message ID or fall back to stable reference
                const targetId: string | undefined = data.data.userMessageId || activeUserMessageIdRef.current;
                
                // 🔗 Map temp ID to backend real ID for refined query rendering
                if (targetId && activeUserMessageIdRef.current && targetId !== activeUserMessageIdRef.current) {
                  messageIdMap.current[activeUserMessageIdRef.current] = targetId;
                }
                
                if (targetId) {
                  setRefinedQueriesMessageId(targetId || activeUserMessageIdRef.current);
                  activeUserMessageIdRef.current = targetId || activeUserMessageIdRef.current;
                }
                
                // Only process refinement if it's for the current active session
                // Use effectiveSessionId as authoritative source during streaming
                if (effectiveSessionId === (sessionId || effectiveSessionId)) {
                  setRefinedQueries(data.data.refined_queries || []);
                  setShowRefinedQueries(true);
                  
                  // Force a re-render by triggering React Query invalidation
                  queryClient.invalidateQueries({ queryKey: ["chat-history", effectiveSessionId] });
                  
                  // Immediately trigger a re-render and scroll to show refined questions
                  setTimeout(() => {
                    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                  }, 50); // Reduced delay for faster feedback
                }
              } else if (data.type === "completion") {
                // Handle main response - validate session first
                // 🔧 FIX: Allow temp sessions to proceed (they'll have different IDs)
                if (effectiveSessionId && effectiveSessionId !== data.data.sessionId && !effectiveSessionId.startsWith('temp-session-')) {
                  console.log('Session ID mismatch:', { effectiveSessionId, backendSessionId: data.data.sessionId });
                  return;
                }
                
                // console.log('Full completion data received:', data.data);
                
                if (pendingUserMessage) {
                  setPendingUserMessage(null);
                }
                
                // 🚀 CRITICAL: Set the real session ID IMMEDIATELY to prevent UI confusion
                const realSessionId = data.data.sessionId;
                // console.log('Session ID transition:', { from: effectiveSessionId, to: realSessionId });
                
                // Update session ID first so UI renders with correct session
                setSessionId(realSessionId);
                setCurrentSources(data.data.sources);
                setCurrentClassification(data.data.classification);
                setCurrentExecutionTime(data.data.executionTimeMs);
                setCurrentResponseType(data.data.responseType);
                
                // 🚀 CRITICAL FIX: Inject assistant message into cache IMMEDIATELY
                if (data.data.messageId) {
                  // 🔧 FIX: Handle cases where content might be missing from completion event
                  // Use accumulated content from streaming or fallback to completion data
                  // Backend sends content in 'answer' field based on logs
                  const messageContent = accumulatedContent || data.data.answer || data.data.content || data.data.response || "[No content received]";
                  const finalMessageId = data.data.messageId || currentMessageId;
                  
                  // console.log('Injecting assistant message into cache:', {
                  //   messageId: data.data.messageId,
                  //   sessionId: data.data.sessionId,
                  //   effectiveSessionId,
                  //   hasAnswer: !!data.data.answer,
                  //   hasContent: !!data.data.content,
                  //   contentLength: messageContent.length,
                  //   allDataKeys: Object.keys(data.data)
                  // });
                  
                  const assistantMessage: Message = {
                    id: finalMessageId,
                    sessionId: data.data.sessionId,
                    role: "assistant",
                    content: messageContent,
                    createdAt: new Date().toISOString(),
                    sources: data.data.sources,
                    classification: data.data.classification,
                    agentTraces: data.data.agentTraces,
                    executionTimeMs: data.data.executionTimeMs,
                    responseType: data.data.responseType,
                    tokenCount: data.data.tokenCount || null,
                    contextWindowUsed: data.data.contextWindowUsed || null,
                    sequenceNumber: data.data.sequenceNumber || 0,
                    parentMessageId: data.data.parentMessageId || null,
                  };
                  
                  // console.log('Final assistant message details:', {
                  //   messageId: finalMessageId,
                  //   contentSource: accumulatedContent ? 'accumulated' : 'completion_event',
                  //   contentLength: messageContent.length,
                  //   contentPreview: messageContent.substring(0, 100) + '...'
                  // });
                  
                  // Update cache for the REAL session ID from backend
                  queryClient.setQueryData(["chat-history", realSessionId], (oldData: { messages: Message[] } | undefined) => {
                    let messages = oldData?.messages || [];
                    
                    // If this is a temp session transition, migrate existing messages
                    if (effectiveSessionId && effectiveSessionId.startsWith('temp-session-') && effectiveSessionId !== realSessionId) {
                      const tempData = queryClient.getQueryData(["chat-history", effectiveSessionId]) as { messages: Message[] } | undefined;
                      if (tempData?.messages) {
                        console.log('🔄 Migrating messages from temp session:', {
                          tempSessionId: effectiveSessionId,
                          realSessionId: realSessionId,
                          messageCount: tempData.messages.length
                        });
                        // Migrate messages and update their session IDs
                        messages = tempData.messages.map(msg => ({
                          ...msg,
                          sessionId: realSessionId
                        }));
                      }
                    }
                    
                    // console.log('Current cache state before injection:', {
                    //   sessionId: realSessionId,
                    //   existingMessages: messages.length,
                    //   messageIds: messages.map(m => m.id)
                    // });
                    
                    // Check if message already exists
                    const exists = messages.some(m => m.id === assistantMessage.id);
                    if (exists) {
                      console.log('🔄 Updating existing assistant message');
                      // Update existing message
                      return {
                        messages: messages.map(m => 
                          m.id === assistantMessage.id ? assistantMessage : m
                        )
                      };
                    }
                    
                    //console.log('Adding new assistant message to cache');
                    // Add new message
                    return {
                      messages: [...messages, assistantMessage]
                    };
                  });
                  
                  // Clean up temp session cache if it exists
                  if (effectiveSessionId && effectiveSessionId.startsWith('temp-session-') && effectiveSessionId !== realSessionId) {
                    console.log('🧹 Cleaning up temp session cache:', effectiveSessionId);
                    queryClient.removeQueries({ queryKey: ["chat-history", effectiveSessionId] });
                  }
                  
                  //console.log('Assistant message injection complete');
                } else {
                  console.log('Missing messageId:', { 
                    messageId: data.data.messageId,
                    hasMessageId: !!data.data.messageId
                  });
                }
                
                // Handle user message ID mapping
                if (data.data.userMessageId) {
                  const prevId = activeUserMessageIdRef.current; // Use ref, not stale state
                  const realId = data.data.userMessageId;
                  
                  setRefinedQueriesMessageId(realId);
                  activeUserMessageIdRef.current = realId;
                  
                  // 🔧 CRITICAL: Re-map cached message ID to backend's real ID + DEDUPE
                  queryClient.setQueryData(["chat-history", data.data.sessionId], (oldData: { messages: Message[] } | undefined) => {
                    if (!oldData?.messages) return oldData;
                    
                    // First, remap temp ID to real ID
                    const mapped = oldData.messages.map(msg =>
                      msg.id === prevId ? { ...msg, id: realId } : msg
                    );
                    
                    // HARD DEDUPE: prevent duplicate user messages
                    const deduped: Message[] = [];
                    const seen = new Set<string>();
                    
                    for (const msg of mapped) {
                      // For user messages that might be duplicates, use consistent key
                      const key = msg.role === "user" && (msg.id === realId || msg.id === prevId)
                        ? "user-" + realId  // Collapse duplicates to single real ID
                        : msg.id;
                      
                      if (!seen.has(key)) {
                        deduped.push(msg);
                        seen.add(key);
                      }
                    }
                    
                    return { messages: deduped };
                  });
                  
                  // 🔗 Update the ID mapping for refined queries
                  if (prevId && realId && prevId !== realId) {
                    messageIdMap.current[prevId] = realId;
                  }
                }
                
                // Automatically select the new assistant message for context panel
                if (data.data.messageId) {
                  selectMessageForContext(data.data.messageId, data.data.sources, data.data.agentTraces);
                } else {
                  // Fallback if no messageId provided
                  setCurrentAgentTraces(data.data.agentTraces);
                }
                
                // Refresh chat sessions metadata (safe, doesn't affect message cache)
                refetchChatSessions();
                
                // � REMOVE THE DELAYED INVALIDATION - cache is now up-to-date
                // The cache already contains the complete assistant message, no need to invalidate
              } else if (data.type === "title_update") {
                // Handle title updates - refresh chat sessions to show new title in sidebar
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
      setSessionLocked(false); // 🔓 Unlock session at end
      
      // 🔄 FIX: Light-touch stale marking instead of aggressive invalidation
      // Cache is already updated in completion handler, just mark as stale without forcing refetch
      if (sessionId) {
        queryClient.invalidateQueries({ 
          queryKey: ["chat-history", sessionId],
          refetchType: 'none' // Don't refetch immediately
        });
      }
    }
  };

  const handleSubmit = async (message: string, documentIds?: string[]) => {
    // Prevent multiple concurrent requests
    if (isStreaming || queryMutation.isPending) {
      return;
    }

    // Clear previous refined queries state
    setRefinedQueries([]);
    setShowRefinedQueries(false);
    // Clear ID mapping for fresh start
    messageIdMap.current = {};

    // If no session exists, create a new one
    if (!sessionId) {
      try {
        // 🚀 OPTIMIZATION: Create a temporary session ID immediately for UI
        const tempSessionId = `temp-session-${Date.now()}`;
        
        // Add user message to cache FIRST (before setting sessionId)
        const newUserMessageId = `user-${Date.now()}`;
        const newUserMessage: Message = {
          id: newUserMessageId,
          sessionId: tempSessionId,
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
        
        // 🚀 CRITICAL: Set cache data FIRST, then set sessionId synchronously
        // This ensures React Query's placeholderData can immediately show cached messages
        queryClient.setQueryData(["chat-history", tempSessionId], {
          messages: [newUserMessage]
        });
        
        // Set sessionId immediately - React Query will use placeholderData from cache
        setSessionId(tempSessionId);
        
        // 🚀 CRITICAL: Set streaming state immediately so chat view shows right away
        // This ensures the UI switches from empty state to chat view before async operations
        setIsStreaming(true);
        setSessionLocked(true);
        
        setRefinedQueriesMessageId(newUserMessageId);
        
        // 🚀 OPTIMIZATION: Start streaming IMMEDIATELY with null sessionId
        // Backend will create session instantly (no blocking title generation)
        // Don't pass temp session ID to backend - let it create a real one immediately
        // Note: handleStreamingQuery will set isStreaming again, but that's fine (idempotent)
        handleStreamingQuery(message, null, documentIds, newUserMessageId);
        return;
      } catch (error) {
        toast({
          title: "Failed to create chat",
          description: "Could not start a new conversation. Please try again.",
          variant: "destructive",
        });
        // Reset session on error
        setSessionId(undefined);
        return;
      }
    }
    
    // For existing sessions, add optimistic user message
    let currentUserMessageId = `temp-${Date.now()}`;
    queryClient.setQueryData(["chat-history", sessionId], (oldData: { messages: Message[] } | undefined) => {
      const newUserMessage: Message = {
        id: currentUserMessageId,
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
    
    // Store the message ID that will receive refined queries
    setRefinedQueriesMessageId(currentUserMessageId);
    
    // Use streaming query with existing session and explicit user message ID
    handleStreamingQuery(message, undefined, documentIds, currentUserMessageId);
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
    // 🚀 FIX: Prevent switching during active streaming
    if (sessionLocked || isStreaming) {
      toast({
        title: "Please wait",
        description: "A message is being processed. Please wait before switching chats.",
      });
      return;
    }
    
    // Prevent selecting the same chat that's already loaded
    if (sessionId === chatId && !isLoadingChatHistory) {
      return;
    }
    
    // Try to get cached data immediately (without API call)
    const cachedHistory = getChatSessionHistory(chatId);
    
    // If we have cached data, we can switch immediately with minimal loading
    if (cachedHistory && Array.isArray(cachedHistory) && cachedHistory.length > 0) {
      // Set session immediately
      setSessionId(chatId);
      
      // Clear current context
      setCurrentSources(undefined);
      setCurrentClassification(undefined);
      setCurrentAgentTraces(undefined);
      setCurrentExecutionTime(undefined);
      setCurrentResponseType(undefined);
      
      // Clear refined queries state
      setRefinedQueries([]);
      setShowRefinedQueries(false);
      setRefinedQueriesMessageId(undefined);
      
      // Update React Query cache with cached data
      queryClient.setQueryData(["chat-history", chatId], { messages: cachedHistory });
      
      // Refresh in background to ensure data is current (non-blocking)
      setTimeout(() => {
        fetchChatSessionHistory(chatId, true).then(freshHistory => {
          if (JSON.stringify(freshHistory) !== JSON.stringify(cachedHistory)) {
            queryClient.setQueryData(["chat-history", chatId], { messages: freshHistory });
          }
        }).catch(error => {
          // Background refresh failed - not critical
        });
      }, 500);
      
    } else {
      // Set loading state for API fetch
      setIsLoadingChatHistory(true);
      setLoadingChatId(chatId);
      
      // Clear current context first to show loading state
      setCurrentSources(undefined);
      setCurrentClassification(undefined);
      setCurrentAgentTraces(undefined);
      setCurrentExecutionTime(undefined);
      setCurrentResponseType(undefined);
      
      // Invalidate and refetch the query for the new chat
      queryClient.invalidateQueries({ 
        queryKey: ["chat-history", chatId],
        exact: true 
      });
      
      // Set the new session ID - this will trigger the query
      setSessionId(chatId);
    }
    
    // On mobile, close sidebar after selection
    if (isMobile) {
      setIsSidebarOpen(false);
    }
  };

  const handleNewChat = () => {
    // console.log('handleNewChat called', {
    //   sessionLocked,
    //   isStreaming,
    //   sessionId,
    //   queryMutationIsPending: queryMutation.isPending,
    //   currentStates: {
    //     sessionId,
    //     isStreaming,
    //     sessionLocked,
    //     hasPendingMessage: !!pendingUserMessage
    //   }
    // });
    
    // 🚀 FIX: Prevent creating new chat during active streaming
    if (sessionLocked || isStreaming) {
      // console.log('New chat blocked - streaming in progress', {
      //   sessionLocked,
      //   isStreaming
      // });
      toast({
        title: "Please wait",
        description: "A message is being processed. Please wait before starting a new chat.",
      });
      return;
    }
    
    // console.log('Clearing all states for new chat');
    
    // 🚀 CRITICAL: Clear query cache for current session before clearing sessionId
    // This ensures the UI updates immediately when sessionId becomes undefined
    if (sessionId) {
      // console.log('Clearing cache for session:', sessionId);
      queryClient.removeQueries({ queryKey: ["chat-history", sessionId] });
      // Also clear any temp session caches
      const allQueries = queryClient.getQueryCache().getAll();
      allQueries.forEach(query => {
        const key = query.queryKey[1];
        if (typeof key === 'string' && key.startsWith('temp-session-')) {
          console.log('🧹 Clearing temp session cache:', key);
          queryClient.removeQueries({ queryKey: query.queryKey });
        }
      });
    }
    
    // Clear current session and start fresh
    setSessionId(undefined);
    setCurrentSources(undefined);
    setCurrentClassification(undefined);
    setCurrentAgentTraces(undefined);
    setCurrentExecutionTime(undefined);
    setCurrentResponseType(undefined);
    setPendingUserMessage(null);
    setSelectedDocumentIds([]); // Clear document selection
    // Clear any refined queries
    setRefinedQueries([]);
    setShowRefinedQueries(false);
    setRefinedQueriesMessageId(undefined);
    // Clear ID mapping
    messageIdMap.current = {};
    // 🚀 FIX: Also clear streaming states to ensure clean state
    setIsStreaming(false);
    setSessionLocked(false);
    
    // console.log('States cleared, sessionId should be undefined now');
    
    // 🚀 CRITICAL: Invalidate all chat-history queries to force UI refresh
    // This ensures the UI updates immediately when sessionId becomes undefined
    queryClient.invalidateQueries({ 
      queryKey: ["chat-history"],
      exact: false // Invalidate all chat-history queries
    });
    
    // On mobile, close sidebar after new chat
    if (isMobile) {
      setIsSidebarOpen(false);
    }
    
    // Refresh chat sessions to update counts and metadata
    refetchChatSessions();
    
    //console.log('New chat initialized successfully');
    
    // 🐛 DEBUG: Log what chatHistory will be after clearing
    setTimeout(() => {
      const currentHistory = queryClient.getQueryData(["chat-history", undefined]);
      console.log('🔍 chatHistory after new chat:', currentHistory);
      console.log('🔍 sessionId after new chat:', sessionId);
    }, 100);
  };

  // Handle document selection changes
  const handleDocumentSelectionChange = (documentIds: string[]) => {
    setSelectedDocumentIds(documentIds);
  };

  // Extract messages and documents with proper typing (moved up to avoid declaration order issues)
  const messages = (chatHistory as { messages: Message[] } | null)?.messages || [];
  const hasMessages = messages.length > 0;
  // 🚀 FIX: Also show chat view when streaming (even if no messages yet)
  // This ensures the chat window appears immediately when user submits a query
  const shouldShowChatView = hasMessages || isStreaming || queryMutation.isPending;
  const documents = (documentsData as any[] | undefined) || []; // Use any[] to avoid Document type conflicts

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

  // Select a message to display its traces in context panel
  const selectMessageForContext = useCallback((messageId: string, sources?: Message["sources"], agentTraces?: any[]) => {
    setSelectedMessageId(messageId);
    setCurrentSources(sources);
    setSelectedSourceIndex(undefined);
    
    // 🛡️ Guard against empty overwrites - only set if agentTraces is explicitly provided
    if (agentTraces !== undefined) {
      if (agentTraces.length > 0) {
        setCurrentAgentTraces(agentTraces);
      } else {
        setCurrentAgentTraces([]);
      }
    }
    // Don't overwrite existing traces if agentTraces is undefined
  }, [setCurrentAgentTraces]);

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
      // Find the most recent assistant message with agent traces
      const lastAssistantMessage = [...messages]
        .reverse()
        .find(msg => 
          msg.role === "assistant" && 
          msg.agentTraces && 
          Array.isArray(msg.agentTraces) && 
          msg.agentTraces.length > 0
        );
      
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

  // Ensure refined queries trigger immediate UI updates
  useEffect(() => {
    if (refinedQueries.length > 0 && showRefinedQueries && refinedQueriesMessageId) {
      // Small delay to ensure the state has propagated
      const timer = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [refinedQueries, showRefinedQueries, refinedQueriesMessageId]);

  // Keep activeUserMessageIdRef in sync with refinedQueriesMessageId
  useEffect(() => {
    activeUserMessageIdRef.current = refinedQueriesMessageId;
  }, [refinedQueriesMessageId]);

  // Safe background preloading - only once after initial app load
  useEffect(() => {
    const preloadSessions = async () => {
      // Only run once and only after app is initialized with sessions
      if (hasPreloadedRef.current || !chatSessions || chatSessions.length === 0) {
        return;
      }
      
      // Wait for app to be stable before preloading
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Double-check we haven't already preloaded and app is still idle
      if (hasPreloadedRef.current || isStreaming || pendingUserMessage || queryMutation.isPending) {
        return;
      }
      
      hasPreloadedRef.current = true; // Mark as preloaded to prevent re-runs
      
      const recentSessions = chatSessions.slice(0, 5);
      console.log(`🚀 Starting one-time background preload for ${recentSessions.length} recent chat sessions`);
      
      for (const session of recentSessions) {
        try {
          if (session.id !== sessionId) {
            await fetchChatSessionHistory(session.id);
          }
        } catch (error) {
          console.log(`⚠️ Preload failed for session ${session.id}:`, error);
          break; // Stop preloading on any error
        }
      }
      
      console.log(`✅ Background preloading completed`);
    };
    
    preloadSessions();
  }, [chatSessions]); // Only depend on chatSessions being available

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
                    <div className="w-full">
                      <EmptyState 
                        onSamplePromptClick={handleSamplePromptClick}
                        uploadedDocuments={documents}
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
                              onMessageClick={selectMessageForContext}
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
                          
                          // For user messages, check if this specific message should show refined queries
                          // Use strict single-ID check now that deduplication is fixed + ID mapping
                          const resolvedRefinedId = refinedQueriesMessageId ? 
                            (messageIdMap.current[refinedQueriesMessageId] || refinedQueriesMessageId) : 
                            undefined;
                          const shouldShowRefinedQueries = message.role === "user" && 
                            (message.id === refinedQueriesMessageId || message.id === resolvedRefinedId);
                          
                          // Reduce animation delay when switching chats to improve scroll timing
                          const animationDelay = loadingChatId === sessionId ? 0 : index * 0.05;
                          
                          return (
                            <motion.div
                              key={message.id}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: animationDelay, duration: 0.3 }}
                            >
                              <MessageBubble
                                message={message}
                                responseType={isLastAssistantMessage ? currentResponseType : undefined}
                                selected={selectedMessageId === message.id}
                                onCitationClick={handleCitationClick}
                                onMessageClick={selectMessageForContext}
                                refinedQueries={shouldShowRefinedQueries ? refinedQueries : undefined}
                                showRefinedQueries={shouldShowRefinedQueries ? showRefinedQueries : false}
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
