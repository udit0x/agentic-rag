import { useCacheStore } from '@/stores/cache-store';
import { apiRequest, API_ENDPOINTS } from '@/lib/api-config';

interface Document {
  id: string;
  filename: string;
  size: number;
  uploadedAt: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  sessionId: string;
  sources?: any;
  classification?: any;
  agentTraces?: any;
  executionTimeMs?: number;
  responseType?: string;
  tokenCount?: number;
  contextWindowUsed?: number;
  sequenceNumber: number;
  parentMessageId?: string;
}

export const useCachedDocuments = () => {
  const {
    getDocumentLibrary,
    setDocumentLibrary,
    invalidateDocumentLibrary,
  } = useCacheStore();

  const fetchDocuments = async (forceRefresh = false): Promise<Document[]> => {
    // Check cache first (unless forced refresh)
    if (!forceRefresh) {
      const cached = getDocumentLibrary();
      if (cached) {
        // console.log('Using cached document library');
        return cached;
      }
    }

    try {
      //console.log('Fetching fresh document library from API');
      const documents = await apiRequest<Document[]>(API_ENDPOINTS.DOCUMENT.LIST);
      
      // Cache the result
      setDocumentLibrary(documents);
      
      return documents;
    } catch (error) {
      console.error('❌ Error fetching documents:', error);
      
      // Fallback to cache if API fails
      const cached = getDocumentLibrary();
      if (cached) {
        // console.log('API failed, using stale cache');
        return cached;
      }
      
      // If no cache available, return empty array but don't throw
      // console.log('No cache available, returning empty array');
      return [];
    }
  };

  const refreshDocuments = () => {
    // console.log('Invalidating document library cache');
    invalidateDocumentLibrary();
  };

  const deleteDocument = async (documentId: string): Promise<void> => {
    try {
      await apiRequest(API_ENDPOINTS.DOCUMENT.DELETE(documentId), {
        method: 'DELETE',
      });
      
      // Invalidate cache after successful deletion
      invalidateDocumentLibrary();
      
    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  };

  return {
    fetchDocuments,
    refreshDocuments,
    deleteDocument,
  };
};

export const useCachedDocumentContent = () => {
  const {
    getDocumentContent,
    setDocumentContent,
  } = useCacheStore();

  const fetchDocumentContent = async (documentId: string): Promise<string> => {
    // Check cache first
    const cached = getDocumentContent(documentId);
    if (cached) {
      // console.log(` Using cached content for document: ${documentId}`);
      return cached;
    }

    try {
      // console.log(`Fetching fresh content for document: ${documentId}`);
      const response = await apiRequest<{ content: string }>(
        API_ENDPOINTS.DOCUMENT.CONTENT(documentId)
      );
      
      const content = response.content || 'No content available';
      
      // Cache the content
      setDocumentContent(documentId, content);
      
      return content;
    } catch (error) {
      console.error(`Error fetching document content for ${documentId}:`, error);
      throw error;
    }
  };

  return {
    fetchDocumentContent,
  };
};

export const useCachedQueries = () => {
  const {
    findSimilarQuery,
    addQueryResult,
    getRecentQueries,
  } = useCacheStore();

  const executeQuery = async (
    query: string, 
    documentIds: string[] = []
  ): Promise<{ result: string; fromCache: boolean }> => {
    // Check for similar cached query
    const similar = findSimilarQuery(query, 0.85); // 85% similarity threshold
    
    if (similar && JSON.stringify(similar.documentIds.sort()) === JSON.stringify(documentIds.sort())) {
      // console.log('Using cached query result for similar query');
      return {
        result: similar.result,
        fromCache: true,
      };
    }

    try {
      // console.log('Executing fresh query');
      
      const requestBody = {
        message: query,
        ...(documentIds.length > 0 && { document_filter: documentIds }),
      };

      const response = await apiRequest<{ response: string }>(
        API_ENDPOINTS.EXECUTE,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );
      
      const result = response.response;
      
      // Cache the result
      addQueryResult(query, result, documentIds);
      
      return {
        result,
        fromCache: false,
      };
    } catch (error) {
      console.error('Error executing query:', error);
      throw error;
    }
  };

  const getQueryHistory = () => {
    return getRecentQueries(20); // Last 20 queries
  };

  return {
    executeQuery,
    getQueryHistory,
  };
};

export const useCachedChatHistory = () => {
  const {
    getChatHistory,
    setChatHistory,
    addChatMessage,
    setChatSessionHistory,
    getChatSessionHistory,
    invalidateChatSession,
    preloadChatSession,
  } = useCacheStore();

  const loadChatHistory = () => {
    return getChatHistory();
  };

  const saveChatHistory = (messages: any[]) => {
    setChatHistory(messages);
  };

  const appendMessage = (message: any) => {
    addChatMessage(message);
  };

  // New methods for session-specific caching
  const fetchChatSessionHistory = async (
    sessionId: string, 
    forceRefresh = false
  ): Promise<Message[]> => {
    // Check cache first (unless forced refresh)
    if (!forceRefresh) {
      const cached = getChatSessionHistory(sessionId);
      if (cached) {
        return cached;
      }
    }

    try {
      const response = await apiRequest<{ messages: Message[]; updatedAt: string }>(
        API_ENDPOINTS.CHAT.HISTORY(sessionId)
      );
      
      const messages = response.messages || [];
      const serverTimestamp = response.updatedAt ? new Date(response.updatedAt).getTime() : undefined;
      
      // Cache the result with server timestamp
      setChatSessionHistory(sessionId, messages, serverTimestamp);
      
      return messages;
    } catch (error) {
      console.error(`Error fetching chat history for ${sessionId}:`, error);
      
      // Fallback to cache if API fails
      const cached = getChatSessionHistory(sessionId);
      if (cached) {
        // console.log('API failed, using stale cache');
        return cached;
      }
      
      // If no cache available, return empty array
      // console.log('No cache available, returning empty array');
      return [];
    }
  };

  const cacheChatSession = (sessionId: string, messages: Message[]) => {
    setChatSessionHistory(sessionId, messages);
  };

  const preloadChatSessions = (sessions: Array<{ id: string; messages?: Message[] }>) => {
    sessions.forEach(session => {
      if (session.messages) {
        preloadChatSession(session.id, session.messages);
      }
    });
    // console.log(`Preloaded ${sessions.length} chat sessions`);
  };

  const invalidateSession = (sessionId: string) => {
    invalidateChatSession(sessionId);
  };

  return {
    loadChatHistory,
    saveChatHistory,
    appendMessage,
    fetchChatSessionHistory,
    cacheChatSession,
    preloadChatSessions,
    invalidateSession,
  };
};

export const useCachedUIState = () => {
  const {
    getSelectedDocuments,
    setSelectedDocuments,
    getUploadStatus,
    setUploadStatus,
  } = useCacheStore();

  const getSelectedDocumentIds = () => {
    return getSelectedDocuments();
  };

  const saveSelectedDocumentIds = (documentIds: string[]) => {
    setSelectedDocuments(documentIds);
  };

  const getLastUploadStatus = () => {
    return getUploadStatus();
  };

  const saveUploadStatus = (status: any[]) => {
    setUploadStatus(status);
  };

  return {
    getSelectedDocumentIds,
    saveSelectedDocumentIds,
    getLastUploadStatus,
    saveUploadStatus,
  };
};