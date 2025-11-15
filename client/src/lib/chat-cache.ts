import { QueryClient } from "@tanstack/react-query";
import { type Message as BaseMessage } from "@shared/schema";

/**
 * Extended message type for client-side cache
 * Includes temporary serverId for tracking optimistic updates
 */
export type Message = BaseMessage & {
  serverId?: string;  // Server-confirmed message ID (for matching refinements)
};

/**
 * Chat events that modify cache state
 */
export type ChatEvent =
  | { type: "started"; tempId?: string; realId: string; userMessageId?: string }
  | { type: "refinement"; sessionId: string; userMessageId: string; refined: string[] }
  | { type: "chunk"; sessionId: string; assistantServerId?: string; append: string }
  | { 
      type: "completion"; 
      sessionId: string; 
      userMessageId: string; 
      assistantServerId: string; 
      answer: string; 
      meta: any 
    }
  | { type: "error"; sessionId: string; message: string };

/**
 * Dedupe array by key function
 */
function dedupeByKey<T>(arr: T[], keyFn: (t: T) => string): T[] {
  const map = new Map<string, T>();
  for (const x of arr) {
    map.set(keyFn(x), x);
  }
  return Array.from(map.values());
}

/**
 * Merge server-fetched messages into local cache.
 * Preserves optimistic messages that haven't been confirmed by server yet.
 */
export function mergeServerHistoryIntoCache(
  local: any[], 
  server: any[]
): any[] {
  // If no local messages, just use server
  if (!local || local.length === 0) {
    return server;
  }
  
  // Create a map of server messages by their ID
  const serverMap = new Map(server.map(m => [m.id, m]));
  
  // Find optimistic/streaming messages that aren't in server response yet
    const optimisticMessages = local.filter(m => {
    // Keep messages that:
    // 1. Have optimistic IDs (not confirmed by server)
    // 2. Are streaming (serverId exists but not in server response yet)
    const isOptimistic = m.id.startsWith('optimistic-');
    const isStreaming = m.serverId && !serverMap.has(m.serverId) && !serverMap.has(m.id);
    return isOptimistic || isStreaming;
  });
  
  // Combine server messages with optimistic ones
  // Use dedupeByKey to avoid duplicates (server messages take precedence)
  return dedupeByKey(
    [...server, ...optimisticMessages],
    (m: any) => m.serverId ?? m.id
  );
}/**
 * 🛡️ STABLE CACHE GETTER - Never returns undefined, always preserves structure
 */
function getStableCacheData(
  qc: QueryClient, 
  sessionId: string
): { messages: Message[]; refinedQueriesFor?: string; refinedQueries?: string[] } {
  const cached = qc.getQueryData<{ 
    messages: Message[]; 
    refinedQueriesFor?: string; 
    refinedQueries?: string[] 
  }>(["chat-history", sessionId]);
  
  // Always return a stable structure
  return {
    messages: cached?.messages ?? [],
    refinedQueriesFor: cached?.refinedQueriesFor,
    refinedQueries: cached?.refinedQueries,
  };
}

/**
 * 🔒 ATOMIC CACHE UPDATE - Single source of truth for cache mutations
 * Prevents partial updates and state loss
 */
function atomicCacheUpdate(
  qc: QueryClient,
  sessionId: string,
  updater: (
    current: { messages: Message[]; refinedQueriesFor?: string; refinedQueries?: string[] }
  ) => { messages: Message[]; refinedQueriesFor?: string; refinedQueries?: string[] }
) {
  const current = getStableCacheData(qc, sessionId);
  const updated = updater(current);
  
  // Only update if something actually changed (prevents unnecessary re-renders)
  const currentJson = JSON.stringify(current);
  const updatedJson = JSON.stringify(updated);
  
  if (currentJson !== updatedJson) {
    qc.setQueryData(["chat-history", sessionId], updated);
  }
}

/**
 * Unified cache write gateway - all cache mutations go through here
 */
export function applyEventToCache(
  qc: QueryClient, 
  ev: ChatEvent, 
  onMigrate?: (tempId: string, realId: string, queryClient: QueryClient, userMessageId?: string) => void
) {
  switch (ev.type) {
    case "started": {
      // Handle session migration (temp → real) FIRST
      // Pass userMessageId to migration so it can inject serverId synchronously
      if (ev.tempId && ev.tempId !== ev.realId && onMigrate) {
        onMigrate(ev.tempId, ev.realId, qc, ev.userMessageId);
      } 
      // ✅ For follow-up messages in existing sessions, inject serverId to the last user message
      else if (ev.userMessageId && ev.realId) {
        atomicCacheUpdate(qc, ev.realId, (current) => {
          const messages = [...current.messages];
          const lastUserIndex = messages.map(m => m.role).lastIndexOf("user");
          
          if (lastUserIndex !== -1 && !messages[lastUserIndex].serverId) {
            messages[lastUserIndex] = {
              ...messages[lastUserIndex],
              serverId: ev.userMessageId
            };
            
            // console.log('[STARTED] Injected serverId to follow-up message:', {
            //   messageId: messages[lastUserIndex].id,
            //   serverId: ev.userMessageId
            // });
          }
          
          return {
            messages,
            refinedQueriesFor: current.refinedQueriesFor,
            refinedQueries: current.refinedQueries,
          };
        });
      }
      
      return;
    }

    case "refinement": {
      atomicCacheUpdate(qc, ev.sessionId, (current) => {
        const recentUserMessages = current.messages.filter(m => m.role === "user");
        const lastUserMessage = recentUserMessages[recentUserMessages.length - 1];
        
        // Use serverId if available, otherwise use the message ID
        const messageServerId = lastUserMessage?.serverId;
        
        // 🛡️ Only update if we have valid data and it's different
        if (!ev.refined || ev.refined.length === 0) {
          console.warn('[CACHE] Skipping invalid refinement event:', ev);
          return current;
        }
        
        // Match the refinement to the correct user message
        // Backend sends userMessageId (serverId), so use that for matching
        const refinedForId = ev.userMessageId;
        
        // Don't overwrite if already set to prevent flicker
        if (current.refinedQueriesFor === refinedForId && 
            JSON.stringify(current.refinedQueries) === JSON.stringify(ev.refined)) {
          return current;
        }
        
        // console.log('[CACHE] Setting refined queries:', {
        //   refinedForId,
        //   messageServerId,
        //   count: ev.refined.length,
        //   queries: ev.refined
        // });
        
        return {
          messages: current.messages,
          refinedQueriesFor: refinedForId, // Use the serverId from backend
          refinedQueries: ev.refined,
        };
      });
      return;
    }

    case "chunk": {
      atomicCacheUpdate(qc, ev.sessionId, (current) => {
        const msgs = [...current.messages] as any[];
        let idx = msgs.findIndex((m) => m.serverId === ev.assistantServerId);
        
        if (idx === -1) {
          // Create placeholder on first chunk
          const newMsg = {
            id: ev.assistantServerId ?? crypto.randomUUID(),
            serverId: ev.assistantServerId ?? null,
            role: "assistant" as const,
            sessionId: ev.sessionId,
            content: ev.append, // Start with first chunk
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
          msgs.push(newMsg);
        } else {
          // Append to existing message
          msgs[idx] = { 
            ...msgs[idx], 
            content: (msgs[idx].content || "") + ev.append 
          };
        }
        
        return {
          messages: msgs,
          refinedQueriesFor: current.refinedQueriesFor,
          refinedQueries: current.refinedQueries,
        };
      });
      return;
    }

    case "completion": {
      atomicCacheUpdate(qc, ev.sessionId, (current) => {
        const msgs = [...current.messages] as any[];

        // Finalize assistant message
        const ai = msgs.findIndex((m) => m.serverId === ev.assistantServerId);
        if (ai !== -1) {
          msgs[ai] = { 
            ...msgs[ai], 
            content: ev.answer,
            serverId: ev.assistantServerId,
            ...ev.meta
          };
        } else {
          // Create new if not found
          msgs.push({
            id: ev.assistantServerId,
            serverId: ev.assistantServerId,
            role: "assistant" as const,
            sessionId: ev.sessionId,
            content: ev.answer,
            createdAt: new Date().toISOString(),
            ...ev.meta,
          });
        }

        const dedupedMessages = dedupeByKey(msgs, (m: any) => m.serverId ?? m.id);

        return {
          messages: dedupedMessages,
          refinedQueriesFor: current.refinedQueriesFor,
          refinedQueries: current.refinedQueries,
        };
      });
      return;
    }

    case "error": {
      atomicCacheUpdate(qc, ev.sessionId, (current) => ({
        messages: [
          ...current.messages,
          {
            id: `error-${Date.now()}`,
            role: "assistant" as const,
            sessionId: ev.sessionId,
            content: ev.message,
            responseType: "error",
            createdAt: new Date().toISOString(),
            sources: null,
            classification: null,
            agentTraces: null,
            executionTimeMs: null,
            tokenCount: null,
            contextWindowUsed: null,
            sequenceNumber: 0,
            parentMessageId: null,
          },
        ],
        refinedQueriesFor: current.refinedQueriesFor,
        refinedQueries: current.refinedQueries,
      }));
      return;
    }
  }
}

/**
 * Check if refined queries should show for a message
 * Matches against serverId first, then falls back to message ID
 */
export function shouldShowRefinedQueries(
  message: Message,
  refinedQueriesFor?: string
): boolean {
  if (!refinedQueriesFor || message.role !== "user") return false;
  
  // Match by serverId first (from backend), then by optimistic ID
  const matches = refinedQueriesFor === message.serverId || refinedQueriesFor === message.id;
  
  return matches;
}
