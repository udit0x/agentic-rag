/**
 * API Configuration
 */

const isDevelopment = import.meta.env.DEV;

const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  
  if (envUrl) {
    return envUrl;
  }
  
  // Default to relative URLs (frontend and backend on same domain)
  return '';
};

export const API_CONFIG = {
  API_BASE_URL: getApiBaseUrl(),
} as const;

export const API_ENDPOINTS = {
  // Query endpoints
  EXECUTE: `${API_CONFIG.API_BASE_URL}/api/query`,
  EXECUTE_STREAM: `${API_CONFIG.API_BASE_URL}/api/query/stream`,
  GENERATE_TITLE: `${API_CONFIG.API_BASE_URL}/api/generate-title`,
  
  // Configuration
  CONFIG: {
    SAVE: `${API_CONFIG.API_BASE_URL}/api/config/save`,
    CURRENT: `${API_CONFIG.API_BASE_URL}/api/config/current`,
    PING: `${API_CONFIG.API_BASE_URL}/api/config/test`,
  },
  
  // Chat operations
  CHAT: {
    HISTORY: (sessionId: string) => `${API_CONFIG.API_BASE_URL}/api/chat/${sessionId}`,
    SESSIONS: `${API_CONFIG.API_BASE_URL}/api/chat-sessions/sessions`,
    CREATE: `${API_CONFIG.API_BASE_URL}/api/chat-sessions/sessions`,
    DELETE: (sessionId: string) => `${API_CONFIG.API_BASE_URL}/api/chat-sessions/sessions/${sessionId}`,
    MESSAGES: (sessionId: string) => `${API_CONFIG.API_BASE_URL}/api/chat-sessions/sessions/${sessionId}/messages`,
  },
  
  // Document operations
  DOCUMENT: {
    LIST: `${API_CONFIG.API_BASE_URL}/api/documents`,
    UPLOAD: `${API_CONFIG.API_BASE_URL}/api/documents/upload`,
    DELETE: (id: string) => `${API_CONFIG.API_BASE_URL}/api/documents/${id}`,
    CONTENT: (id: string) => `${API_CONFIG.API_BASE_URL}/api/documents/${id}/content`,
  },
  
  // User operations
  USER: {
    INFO: `${API_CONFIG.API_BASE_URL}/api/users/me/quota`,
    SETTINGS: `${API_CONFIG.API_BASE_URL}/api/users/me/preferences`,
    KEY_STATUS: `${API_CONFIG.API_BASE_URL}/api/users/me/personal-key/status`,
    KEY: `${API_CONFIG.API_BASE_URL}/api/users/me/personal-key`,
  },
  
  // System
  HEALTH: `${API_CONFIG.API_BASE_URL}/api/ts-health`,
  ANALYTICS: `${API_CONFIG.API_BASE_URL}/api/ts/analytics`,
} as const;

/**
 * API request wrapper
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
          try {
            const jsonError = JSON.parse(errorBody);
            errorMessage = jsonError.detail || jsonError.message || errorMessage;
          } catch {
            errorMessage = errorBody;
          }
        }
      } catch {
        // Use status text
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