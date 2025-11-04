/**
 * API Configuration - centralized URL management
 */

// Determine base URLs based on environment
const isDevelopment = import.meta.env.DEV;

export const API_CONFIG = {
  // TypeScript Express API (documents, storage)
  EXPRESS_BASE_URL: isDevelopment ? 'http://localhost:5000' : '',
  
  // Python FastAPI (chat, config, queries)  
  PYTHON_BASE_URL: isDevelopment ? 'http://localhost:8000' : '',
} as const;

export const API_ENDPOINTS = {
  // Python FastAPI endpoints
  QUERY: `${API_CONFIG.PYTHON_BASE_URL}/api/query`,
  QUERY_STREAM: `${API_CONFIG.PYTHON_BASE_URL}/api/query/stream`,
  CONFIG_SAVE: `${API_CONFIG.PYTHON_BASE_URL}/api/config/save`,
  CONFIG_CURRENT: `${API_CONFIG.PYTHON_BASE_URL}/api/config/current`,
  CHAT_HISTORY: (sessionId: string) => `${API_CONFIG.PYTHON_BASE_URL}/api/chat/${sessionId}`,
  
  // Chat session management endpoints
  CHAT_SESSIONS: `${API_CONFIG.PYTHON_BASE_URL}/api/chat-sessions/sessions`,
  CREATE_CHAT_SESSION: `${API_CONFIG.PYTHON_BASE_URL}/api/chat-sessions/sessions`,
  DELETE_CHAT_SESSION: (sessionId: string) => `${API_CONFIG.PYTHON_BASE_URL}/api/chat-sessions/sessions/${sessionId}`,
  CHAT_SESSION_MESSAGES: (sessionId: string) => `${API_CONFIG.PYTHON_BASE_URL}/api/chat-sessions/sessions/${sessionId}/messages`,
  
  // Document endpoints - now using Python for complete pipeline
  DOCUMENTS: `${API_CONFIG.PYTHON_BASE_URL}/api/documents`,
  DOCUMENT_UPLOAD: `${API_CONFIG.PYTHON_BASE_URL}/api/documents/upload`,
  DOCUMENT_DELETE: (id: string) => `${API_CONFIG.PYTHON_BASE_URL}/api/documents/${id}`,
  DOCUMENT_CONTENT: (id: string) => `${API_CONFIG.PYTHON_BASE_URL}/api/documents/${id}/content`,
  
  // Express TypeScript endpoints (non-document operations)
  HEALTH: `${API_CONFIG.EXPRESS_BASE_URL}/api/ts-health`,
  ANALYTICS: `${API_CONFIG.EXPRESS_BASE_URL}/api/ts/analytics`,
} as const;

/**
 * Enhanced fetch wrapper with proper error handling
 */
export async function apiRequest<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  try {
    const response = await fetch(url, {
      credentials: "include",
      ...options,
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
      try {
        const errorBody = await response.text();
        if (errorBody) {
          // Try to parse as JSON first, fallback to text
          try {
            const jsonError = JSON.parse(errorBody);
            errorMessage = jsonError.detail || jsonError.message || errorMessage;
          } catch {
            errorMessage = errorBody;
          }
        }
      } catch {
        // If we can't read the response body, use the status text
      }
      
      throw new Error(errorMessage);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    } else {
      return await response.text() as T;
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Request failed: ${String(error)}`);
  }
}