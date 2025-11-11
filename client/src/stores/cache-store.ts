import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import React from 'react';

interface Document {
  id: string;
  filename: string;
  size: number;
  uploadedAt: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  documentIds?: string[];
}

interface ChatSessionCache {
  sessionId: string;
  messages: any[]; // Using any[] to match Message type from schema
  lastAccessed: number;
  cachedAt: number;
  latestMessageTimestamp?: number; // Timestamp of most recent message for staleness detection
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt?: number;
}

interface DocumentContent {
  id: string;
  content: string;
  cachedAt: number;
}

interface QueryResult {
  query: string;
  result: string;
  documentIds: string[];
  timestamp: number;
}

interface CacheState {
  // Document Library Cache
  documentLibrary: CacheEntry<Document[]> | null;
  documentContents: Map<string, DocumentContent>;
  
  // Chat & Query Cache
  recentQueries: QueryResult[];
  chatHistory: ChatMessage[];
  chatSessions: Map<string, ChatSessionCache>; // New: Chat session specific caching
  
  // UI State Cache
  selectedDocumentIds: string[];
  lastUploadStatus: any[];
  
  // Cache Actions
  setDocumentLibrary: (documents: Document[], ttl?: number) => void;
  getDocumentLibrary: () => Document[] | null;
  invalidateDocumentLibrary: () => void;
  
  setDocumentContent: (id: string, content: string) => void;
  getDocumentContent: (id: string) => string | null;
  
  addQueryResult: (query: string, result: string, documentIds: string[]) => void;
  getRecentQueries: (limit?: number) => QueryResult[];
  findSimilarQuery: (query: string, threshold?: number) => QueryResult | null;
  
  setChatHistory: (messages: ChatMessage[]) => void;
  addChatMessage: (message: ChatMessage) => void;
  getChatHistory: () => ChatMessage[];
  
  // New Chat Session Cache Methods
  setChatSessionHistory: (sessionId: string, messages: any[], serverTimestamp?: number) => void;
  getChatSessionHistory: (sessionId: string, serverTimestamp?: number) => any[] | null;
  invalidateChatSession: (sessionId: string) => void;
  preloadChatSession: (sessionId: string, messages: any[]) => void;
  
  setSelectedDocuments: (documentIds: string[]) => void;
  getSelectedDocuments: () => string[];
  
  setUploadStatus: (status: any[]) => void;
  getUploadStatus: () => any[];
  
  // Cache Management
  clearAllCache: () => void;
  clearExpiredCache: () => void;
  getCacheStats: () => {
    documentLibrarySize: number;
    documentContentsSize: number;
    queryCacheSize: number;
    chatHistorySize: number;
    chatSessionsSize: number;
    totalMemoryUsage: string;
  };
}

// Default TTL values (in milliseconds)
const DEFAULT_TTL = {
  DOCUMENT_LIBRARY: 5 * 60 * 1000, // 5 minutes
  DOCUMENT_CONTENT: 10 * 60 * 1000, // 10 minutes
  QUERY_RESULTS: 30 * 60 * 1000, // 30 minutes
  CHAT_HISTORY: 60 * 60 * 1000, // 1 hour
  CHAT_SESSION: 30 * 60 * 1000, // 30 minutes for individual chat sessions
};

// Helper function to calculate string size in bytes
const getStringSize = (str: string): number => {
  return new Blob([str]).size;
};

// Similarity check for queries (optimized with early exit)
const calculateSimilarity = (str1: string, str2: string): number => {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  // Early exit if length difference is too large
  if (longer.length - shorter.length > longer.length * 0.3) {
    return 0;
  }
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
};

const levenshteinDistance = (str1: string, str2: string): number => {
  // Optimize for very short strings
  if (str1.length === 0) return str2.length;
  if (str2.length === 0) return str1.length;
  
  // Use single array instead of matrix for better memory performance
  const row: number[] = Array.from({ length: str1.length + 1 }, (_, i) => i);
  
  for (let i = 1; i <= str2.length; i++) {
    let prev = i;
    for (let j = 1; j <= str1.length; j++) {
      let val;
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        val = row[j - 1];
      } else {
        val = Math.min(
          row[j - 1] + 1, // substitution
          prev + 1,       // insertion
          row[j] + 1      // deletion
        );
      }
      row[j - 1] = prev;
      prev = val;
    }
    row[str1.length] = prev;
  }
  
  return row[str1.length];
};

export const useCacheStore = create<CacheState>()(
  devtools(
    (set: any, get: any) => ({
      // Initial state
      documentLibrary: null,
      documentContents: new Map(),
      recentQueries: [],
      chatHistory: [],
      chatSessions: new Map(),
      selectedDocumentIds: [],
      lastUploadStatus: [],

      // Document Library Cache
      setDocumentLibrary: (documents: Document[], ttl = DEFAULT_TTL.DOCUMENT_LIBRARY) => {
        const expiresAt = Date.now() + ttl;
        set({
          documentLibrary: {
            data: documents,
            timestamp: Date.now(),
            expiresAt,
          },
        }, false, 'setDocumentLibrary');
      },

      getDocumentLibrary: () => {
        const { documentLibrary } = get();
        if (!documentLibrary) return null;
        
        if (documentLibrary.expiresAt && Date.now() > documentLibrary.expiresAt) {
          set({ documentLibrary: null }, false, 'expiredDocumentLibrary');
          return null;
        }
        
        return documentLibrary.data;
      },

      invalidateDocumentLibrary: () => {
        set({ documentLibrary: null }, false, 'invalidateDocumentLibrary');
      },

      // Document Content Cache
      setDocumentContent: (id: string, content: string) => {
        const { documentContents } = get();
        const newContents = new Map(documentContents);
        newContents.set(id, {
          id,
          content,
          cachedAt: Date.now(),
        });
        set({ documentContents: newContents }, false, 'setDocumentContent');
      },

      getDocumentContent: (id: string) => {
        const { documentContents } = get();
        const cached = documentContents.get(id);
        
        if (!cached) return null;
        
        // Check if content is expired (10 minutes)
        if (Date.now() - cached.cachedAt > DEFAULT_TTL.DOCUMENT_CONTENT) {
          const newContents = new Map(documentContents);
          newContents.delete(id);
          set({ documentContents: newContents }, false, 'expiredDocumentContent');
          return null;
        }
        
        return cached.content;
      },

      // Query Cache
      addQueryResult: (query: string, result: string, documentIds: string[]) => {
        const { recentQueries } = get();
        const newQuery: QueryResult = {
          query: query.toLowerCase().trim(),
          result,
          documentIds,
          timestamp: Date.now(),
        };
        
        // Keep only last 50 queries
        const updatedQueries = [newQuery, ...recentQueries.slice(0, 49)];
        set({ recentQueries: updatedQueries }, false, 'addQueryResult');
      },

      getRecentQueries: (limit = 10) => {
        const { recentQueries } = get();
        const validQueries = recentQueries.filter(
          (query: QueryResult) => Date.now() - query.timestamp < DEFAULT_TTL.QUERY_RESULTS
        );
        
        if (validQueries.length !== recentQueries.length) {
          set({ recentQueries: validQueries }, false, 'cleanExpiredQueries');
        }
        
        return validQueries.slice(0, limit);
      },

      findSimilarQuery: (query: string, threshold = 0.8) => {
        const { recentQueries } = get();
        const normalizedQuery = query.toLowerCase().trim();
        
        for (const cachedQuery of recentQueries) {
          if (Date.now() - cachedQuery.timestamp > DEFAULT_TTL.QUERY_RESULTS) continue;
          
          const similarity = calculateSimilarity(normalizedQuery, cachedQuery.query);
          if (similarity >= threshold) {
            return cachedQuery;
          }
        }
        
        return null;
      },

      // Chat History
      setChatHistory: (messages: ChatMessage[]) => {
        set({ chatHistory: messages }, false, 'setChatHistory');
      },

      addChatMessage: (message: ChatMessage) => {
        const { chatHistory } = get();
        set({ 
          chatHistory: [...chatHistory, message]
        }, false, 'addChatMessage');
      },

      getChatHistory: () => {
        const { chatHistory } = get();
        // Filter out messages older than 1 hour for session cache
        const validMessages = chatHistory.filter(
          (msg: ChatMessage) => Date.now() - new Date(msg.timestamp).getTime() < DEFAULT_TTL.CHAT_HISTORY
        );
        
        if (validMessages.length !== chatHistory.length) {
          set({ chatHistory: validMessages }, false, 'cleanExpiredChatHistory');
        }
        
        return validMessages;
      },

      // Chat Session Cache Methods
      setChatSessionHistory: (sessionId: string, messages: any[], serverTimestamp?: number) => {
        const { chatSessions } = get();
        const newSessions = new Map(chatSessions);
        
        // Extract latest message timestamp from messages array
        let latestMessageTimestamp: number | undefined;
        if (messages.length > 0) {
          // Messages should have createdAt field (ISO string or timestamp)
          const lastMessage = messages[messages.length - 1];
          if (lastMessage?.createdAt) {
            latestMessageTimestamp = typeof lastMessage.createdAt === 'string' 
              ? new Date(lastMessage.createdAt).getTime()
              : lastMessage.createdAt;
          }
        }
        
        // Use provided server timestamp if available, otherwise use extracted timestamp
        const versionTimestamp = serverTimestamp || latestMessageTimestamp;
        
        newSessions.set(sessionId, {
          sessionId,
          messages,
          lastAccessed: Date.now(),
          cachedAt: Date.now(),
          latestMessageTimestamp: versionTimestamp,
        });
        set({ chatSessions: newSessions }, false, `setChatSessionHistory:${sessionId}`);
      },

      getChatSessionHistory: (sessionId: string, serverTimestamp?: number) => {
        const { chatSessions } = get();
        const cached = chatSessions.get(sessionId);
        
        if (!cached) {
          //console.log(`💬 No cached chat history for session: ${sessionId}`);
          return null;
        }
        
        // If server timestamp provided, check if server has newer data
        if (serverTimestamp !== undefined && cached.latestMessageTimestamp !== undefined) {
          if (serverTimestamp > cached.latestMessageTimestamp) {
            console.log(`🔄 Server has newer data for session ${sessionId} (server: ${new Date(serverTimestamp).toISOString()}, cached: ${new Date(cached.latestMessageTimestamp).toISOString()})`);
            // Return null to force a fresh fetch
            const newSessions = new Map(chatSessions);
            newSessions.delete(sessionId);
            set({ chatSessions: newSessions }, false, `staleDataDetected:${sessionId}`);
            return null;
          }
        }
        
        // Check if cache is expired (30 minutes)
        const now = Date.now();
        if (now - cached.cachedAt > DEFAULT_TTL.CHAT_SESSION) {
          console.log(`⏰ Chat session cache expired for: ${sessionId}`);
          const newSessions = new Map(chatSessions);
          newSessions.delete(sessionId);
          set({ chatSessions: newSessions }, false, `expiredChatSession:${sessionId}`);
          return null;
        }
        
        // Update last accessed time
        const newSessions = new Map(chatSessions);
        cached.lastAccessed = now;
        newSessions.set(sessionId, cached);
        set({ chatSessions: newSessions }, false, `accessChatSession:${sessionId}`);
        
        //console.log(`📋 Using cached chat history for session: ${sessionId} (${cached.messages.length} messages)`);
        return cached.messages;
      },

      invalidateChatSession: (sessionId: string) => {
        const { chatSessions } = get();
        const newSessions = new Map(chatSessions);
        newSessions.delete(sessionId);
        set({ chatSessions: newSessions }, false, `invalidateChatSession:${sessionId}`);
      },

      preloadChatSession: (sessionId: string, messages: any[]) => {
        const { chatSessions } = get();
        
        // Only preload if not already cached or cache is stale
        const cached = chatSessions.get(sessionId);
        const now = Date.now();
        
        if (!cached || (now - cached.cachedAt) > (DEFAULT_TTL.CHAT_SESSION * 0.7)) {
          // Extract latest message timestamp
          let latestMessageTimestamp: number | undefined;
          if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage?.createdAt) {
              latestMessageTimestamp = typeof lastMessage.createdAt === 'string' 
                ? new Date(lastMessage.createdAt).getTime()
                : lastMessage.createdAt;
            }
          }
          
          const newSessions = new Map(chatSessions);
          newSessions.set(sessionId, {
            sessionId,
            messages,
            lastAccessed: now,
            cachedAt: now,
            latestMessageTimestamp,
          });
          set({ chatSessions: newSessions }, false, `preloadChatSession:${sessionId}`);
          console.log(`🚀 Preloaded chat session: ${sessionId} (${messages.length} messages)`);
        }
      },

      // UI State Cache
      setSelectedDocuments: (documentIds: string[]) => {
        set({ selectedDocumentIds: documentIds }, false, 'setSelectedDocuments');
      },

      getSelectedDocuments: () => {
        return get().selectedDocumentIds;
      },

      setUploadStatus: (status: any[]) => {
        set({ lastUploadStatus: status }, false, 'setUploadStatus');
      },

      getUploadStatus: () => {
        return get().lastUploadStatus;
      },

      // Cache Management
      clearAllCache: () => {
        set({
          documentLibrary: null,
          documentContents: new Map(),
          recentQueries: [],
          chatHistory: [],
          chatSessions: new Map(),
          selectedDocumentIds: [],
          lastUploadStatus: [],
        }, false, 'clearAllCache');
      },

      clearExpiredCache: () => {
        const state = get();
        const now = Date.now();
        
        // Clear expired document library
        let newDocumentLibrary = state.documentLibrary;
        if (newDocumentLibrary?.expiresAt && now > newDocumentLibrary.expiresAt) {
          newDocumentLibrary = null;
        }
        
        // Clear expired document contents
        const newDocumentContents = new Map();
        state.documentContents.forEach((content: DocumentContent, id: string) => {
          if (now - content.cachedAt <= DEFAULT_TTL.DOCUMENT_CONTENT) {
            newDocumentContents.set(id, content);
          }
        });
        
        // Clear expired queries
        const newRecentQueries = state.recentQueries.filter(
          (query: QueryResult) => now - query.timestamp <= DEFAULT_TTL.QUERY_RESULTS
        );
        
        // Clear expired chat history
        const newChatHistory = state.chatHistory.filter(
          (msg: ChatMessage) => now - new Date(msg.timestamp).getTime() <= DEFAULT_TTL.CHAT_HISTORY
        );
        
        // Clear expired chat sessions
        const newChatSessions = new Map();
        state.chatSessions.forEach((session: ChatSessionCache, sessionId: string) => {
          if (now - session.cachedAt <= DEFAULT_TTL.CHAT_SESSION) {
            newChatSessions.set(sessionId, session);
          }
        });
        
        set({
          documentLibrary: newDocumentLibrary,
          documentContents: newDocumentContents,
          recentQueries: newRecentQueries,
          chatHistory: newChatHistory,
          chatSessions: newChatSessions,
        }, false, 'clearExpiredCache');
      },

      getCacheStats: () => {
        const state = get();
        
        const docLibSize = state.documentLibrary 
          ? getStringSize(JSON.stringify(state.documentLibrary))
          : 0;
          
        const docContentsSize = Array.from(state.documentContents.values())
          .reduce((total: number, content) => total + getStringSize((content as DocumentContent).content), 0);
          
        const queryCacheSize = getStringSize(JSON.stringify(state.recentQueries));
        const chatHistorySize = getStringSize(JSON.stringify(state.chatHistory));
        const chatSessionsSize = Array.from(state.chatSessions.values())
          .reduce((total: number, session) => total + getStringSize(JSON.stringify((session as ChatSessionCache).messages)), 0);
        
        const totalBytes = docLibSize + docContentsSize + queryCacheSize + chatHistorySize + chatSessionsSize;
        const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
        
        return {
          documentLibrarySize: docLibSize,
          documentContentsSize: docContentsSize,
          queryCacheSize: queryCacheSize,
          chatHistorySize: chatHistorySize,
          chatSessionsSize: chatSessionsSize,
          totalMemoryUsage: `${totalMB} MB`,
        };
      },
    }),
    {
      name: 'cache-store',
      // Only enable devtools in development
      enabled: import.meta.env.DEV,
    }
  )
);

// Hook for cache management
export const useCacheManagement = () => {
  const clearAllCache = useCacheStore((state: CacheState) => state.clearAllCache);
  const clearExpiredCache = useCacheStore((state: CacheState) => state.clearExpiredCache);
  const getCacheStats = useCacheStore((state: CacheState) => state.getCacheStats);
  
  // Auto-cleanup expired cache every 5 minutes
  React.useEffect(() => {
    const interval = setInterval(clearExpiredCache, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [clearExpiredCache]);
  
  return {
    clearAllCache,
    clearExpiredCache,
    getCacheStats,
  };
};

// Export cache utilities for debugging
export const cacheUtils = {
  DEFAULT_TTL,
  calculateSimilarity,
};