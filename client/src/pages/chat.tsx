import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Message, type QueryResponse } from "@shared/schema";
import { Header } from "@/components/layout/header";
import { MessageBubble } from "@/components/chat/message-bubble";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { MessageInput } from "@/components/chat/message-input";
import { EmptyState } from "@/components/chat/empty-state";
import { ContextPanel } from "@/components/context/context-panel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

export default function Chat() {
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number | undefined>();
  const [currentSources, setCurrentSources] = useState<Message["sources"]>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: chatHistory, isLoading: isLoadingHistory } = useQuery<{ messages: Message[] }>({
    queryKey: ["/api/chat", sessionId],
    enabled: !!sessionId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      // Mock upload for Phase 1 demo
      return new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 2000);
      });
    },
    onSuccess: () => {
      toast({
        title: "Upload successful",
        description: "Document processed and ready for querying",
      });
    },
  });

  const queryMutation = useMutation({
    mutationFn: async (query: string) => {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      const newSessionId = sessionId || `session-${Date.now()}`;
      
      // Mock response
      const mockSources = [
        {
          documentId: "doc-1",
          chunkId: "chunk-1-0",
          filename: "Azure_AI_Services_Overview.pdf",
          excerpt: "Azure OpenAI Service provides REST API access to OpenAI's powerful language models including GPT-4, GPT-3.5-Turbo, and Embeddings models.",
          score: 0.92,
        },
        {
          documentId: "doc-2",
          chunkId: "chunk-2-1",
          filename: "RAG_Best_Practices.txt",
          excerpt: "Retrieval-Augmented Generation (RAG) combines retrieval-based and generation-based approaches for more accurate and factually grounded responses.",
          score: 0.88,
        },
      ];
      
      const answer = `Based on the uploaded documents, ${query.toLowerCase().includes("azure") ? "Azure OpenAI Service" : "the RAG system"} provides powerful capabilities for document intelligence.\n\n**Key Points:**\n\n1. **Semantic Understanding**: The system uses embedding models to understand the meaning of queries beyond keywords [1].\n\n2. **Accurate Retrieval**: Documents are retrieved based on semantic similarity [2].\n\n3. **Grounded Responses**: All answers are generated using retrieved context, providing factually accurate information with citations.\n\nThis approach combines retrieval and generation to deliver intelligent, trustworthy answers from your document collection.`;
      
      return {
        sessionId: newSessionId,
        messageId: `msg-${Date.now()}`,
        answer,
        sources: mockSources,
      };
    },
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setCurrentSources(data.sources);
      queryClient.invalidateQueries({ queryKey: ["/api/chat", data.sessionId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Query failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (message: string) => {
    queryMutation.mutate(message);
  };

  const handleUpload = async (file: File) => {
    await uploadMutation.mutateAsync(file);
  };

  const handleCitationClick = (index: number) => {
    setSelectedSourceIndex(index);
  };

  const handleSamplePromptClick = (prompt: string) => {
    handleSubmit(prompt);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory?.messages, queryMutation.isPending]);

  const messages = chatHistory?.messages || [];
  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header onUpload={handleUpload} />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          <ScrollArea className="flex-1">
            <div className="max-w-4xl mx-auto px-4 py-6">
              {!hasMessages && !queryMutation.isPending ? (
                <EmptyState onSamplePromptClick={handleSamplePromptClick} />
              ) : (
                <div className="space-y-6">
                  {messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      onCitationClick={handleCitationClick}
                    />
                  ))}
                  {queryMutation.isPending && <TypingIndicator />}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="flex-shrink-0 border-t border-border bg-background">
            <div className="max-w-4xl mx-auto px-4 py-4">
              <MessageInput
                onSubmit={handleSubmit}
                disabled={queryMutation.isPending}
              />
            </div>
          </div>
        </div>

        <div className="hidden lg:block w-96 border-l border-border bg-card">
          <ContextPanel
            sources={currentSources}
            selectedSourceIndex={selectedSourceIndex}
          />
        </div>
      </div>
    </div>
  );
}
