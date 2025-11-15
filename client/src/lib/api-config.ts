/**
 * API Configuration - centralized URL management
 */

// Determine base URLs based on environment
const isDevelopment = import.meta.env.DEV;

// Get API base URL with production validation
const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  
  if (envUrl) {
    return envUrl;
  }
  
  if (isDevelopment) {
    // In development, Vite dev server proxies API requests
    // So we use empty string to make requests relative to current origin
    return '';
  }
  
  // In production, API_BASE_URL must be explicitly set
  throw new Error(
    'VITE_API_BASE_URL environment variable is required in production. ' +
    'Please set it to your API server URL.'
  );
};

export const API_CONFIG = {
  // All API requests go through Express (port 3000) which proxies to Python FastAPI
  // This ensures authentication middleware is always applied
  // Use environment variable for flexibility in deployment
  API_BASE_URL: getApiBaseUrl(),
} as const;

export const API_ENDPOINTS = {
  // Python FastAPI endpoints (proxied through Express for authentication)
  QUERY: `${API_CONFIG.API_BASE_URL}/api/query`,
  QUERY_STREAM: `${API_CONFIG.API_BASE_URL}/api/query/stream`,
  GENERATE_TITLE: `${API_CONFIG.API_BASE_URL}/api/generate-title`,
  CONFIG_SAVE: `${API_CONFIG.API_BASE_URL}/api/config/save`,
  CONFIG_CURRENT: `${API_CONFIG.API_BASE_URL}/api/config/current`,
  CONFIG_TEST: `${API_CONFIG.API_BASE_URL}/api/config/test`,
  CHAT_HISTORY: (sessionId: string) => `${API_CONFIG.API_BASE_URL}/api/chat/${sessionId}`,
  
  // Chat session management endpoints
  CHAT_SESSIONS: `${API_CONFIG.API_BASE_URL}/api/chat-sessions/sessions`,
  CREATE_CHAT_SESSION: `${API_CONFIG.API_BASE_URL}/api/chat-sessions/sessions`,
  DELETE_CHAT_SESSION: (sessionId: string) => `${API_CONFIG.API_BASE_URL}/api/chat-sessions/sessions/${sessionId}`,
  CHAT_SESSION_MESSAGES: (sessionId: string) => `${API_CONFIG.API_BASE_URL}/api/chat-sessions/sessions/${sessionId}/messages`,
  
  // Document endpoints
  DOCUMENTS: `${API_CONFIG.API_BASE_URL}/api/documents`,
  DOCUMENT_UPLOAD: `${API_CONFIG.API_BASE_URL}/api/documents/upload`,
  DOCUMENT_DELETE: (id: string) => `${API_CONFIG.API_BASE_URL}/api/documents/${id}`,
  DOCUMENT_CONTENT: (id: string) => `${API_CONFIG.API_BASE_URL}/api/documents/${id}/content`,
  
  // User endpoints
  USER_QUOTA: `${API_CONFIG.API_BASE_URL}/api/users/me/quota`,
  USER_PREFERENCES: `${API_CONFIG.API_BASE_URL}/api/users/me/preferences`,
  USER_PERSONAL_KEY_STATUS: `${API_CONFIG.API_BASE_URL}/api/users/me/personal-key/status`,
  USER_PERSONAL_KEY: `${API_CONFIG.API_BASE_URL}/api/users/me/personal-key`,
  
  // Express TypeScript endpoints
  HEALTH: `${API_CONFIG.API_BASE_URL}/api/ts-health`,
  ANALYTICS: `${API_CONFIG.API_BASE_URL}/api/ts/analytics`,
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