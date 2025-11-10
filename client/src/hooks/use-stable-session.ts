import { useState, useRef, useCallback } from "react";
import { QueryClient } from "@tanstack/react-query";
import { type Message } from "@/lib/chat-cache";  // Use extended Message type with serverId

/**
 * Stable session controller with ref-backed authority.
 * State is for rendering; ref is the source of truth for cache writes.
 */
export function useStableSession() {
  const [sessionId, _setSessionId] = useState<string | undefined>(undefined);
  const sessionIdRef = useRef<string | undefined>(undefined);

  const setSession = useCallback((id: string | undefined) => {
    sessionIdRef.current = id;
    _setSessionId(id);
  }, []);

  const getSessionId = useCallback(() => sessionIdRef.current, []);

  const migrate = useCallback((tempId: string, realId: string, queryClient: QueryClient, userMessageId?: string) => {
    console.log("[MIGRATE] Starting migration:", { tempId, realId, userMessageId });
    
    if (sessionIdRef.current === tempId) {
      setSession(realId);
    }

    const temp = queryClient.getQueryData<{ 
      messages: Message[]; 
      refinedQueriesFor?: string; 
      refinedQueries?: string[] 
    }>(["chat-history", tempId]);
    
    console.log("[MIGRATE] Temp session data:", {
      messageCount: temp?.messages?.length,
      messages: temp?.messages?.map(m => ({
        id: m.id,
        serverId: m.serverId,
        role: m.role,
        content: m.content.substring(0, 30) + "..."
      })),
      refinedQueriesFor: temp?.refinedQueriesFor
    });
    
    queryClient.setQueryData(
      ["chat-history", realId], 
      (old?: { messages: Message[]; refinedQueriesFor?: string; refinedQueries?: string[] }) => {
        const merged = [...(old?.messages ?? []), ...(temp?.messages ?? [])]
          // Dedupe by clientId or id
          .reduce<Map<string, Message>>((acc, m) => {
            const key = (m as any).clientId ?? m.id;
            if (!acc.has(key)) {
              // Create migrated message with proper typing
              const migratedMessage: Message = { 
                ...m, 
                sessionId: realId,
                // 🔗 INJECT serverId during migration for user messages
                serverId: (userMessageId && m.role === "user") ? userMessageId : m.serverId
              };
              
              if (userMessageId && m.role === "user") {
                console.log("[MIGRATE] Injected serverId during migration:", {
                  messageId: m.id,
                  serverId: userMessageId
                });
              }
              
              console.log("[MIGRATE] Adding message to real session:", {
                key,
                originalId: m.id,
                serverId: migratedMessage.serverId,
                newSessionId: realId
              });
              acc.set(key, migratedMessage);
            }
            return acc;
          }, new Map());
        
        const result = { 
          messages: Array.from(merged.values()),
          refinedQueriesFor: temp?.refinedQueriesFor ?? old?.refinedQueriesFor,
          refinedQueries: temp?.refinedQueries ?? old?.refinedQueries,
        };
        
        console.log("[MIGRATE] Migration complete:", {
          messageCount: result.messages.length,
          refinedQueriesFor: result.refinedQueriesFor,
          messages: result.messages.map(m => ({
            id: m.id,
            serverId: m.serverId,
            role: m.role
          }))
        });
        
        // Preserve refinedQueriesFor and refinedQueries from temp session
        return result;
      }
    );

    queryClient.removeQueries({ queryKey: ["chat-history", tempId] });
  }, [setSession]);

  return { sessionId, setSession, getSessionId, migrate };
}
