/**
 * Mock API implementation for development and demonstration.
 * This will be replaced with real API calls when backend is fully integrated.
 */
import { type QueryResponse, type Message } from "@shared/schema";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const mockSources = [
  {
    documentId: "doc-1",
    chunkId: "chunk-1-0",
    filename: "Azure_AI_Services_Overview.pdf",
    excerpt: "Azure OpenAI Service provides REST API access to OpenAI's powerful language models including GPT-4, GPT-3.5-Turbo, and Embeddings models. These models can be easily adapted to your specific task including content generation, summarization, semantic search, and natural language to code translation.",
    score: 0.92,
  },
  {
    documentId: "doc-2",
    chunkId: "chunk-2-1",
    filename: "RAG_Best_Practices.txt",
    excerpt: "Retrieval-Augmented Generation (RAG) combines the benefits of retrieval-based and generation-based approaches. By retrieving relevant documents and using them as context for generation, RAG systems can provide more accurate and factually grounded responses while citing their sources.",
    score: 0.88,
  },
  {
    documentId: "doc-1",
    chunkId: "chunk-1-2",
    filename: "Azure_AI_Services_Overview.pdf",
    excerpt: "The embedding models convert text into numerical vector representations that capture semantic meaning. This enables semantic search capabilities where documents can be retrieved based on meaning rather than just keyword matching.",
    score: 0.85,
  },
];

const mockMessages: Message[] = [];

export const mockApi = {
  uploadDocument: async (file: File): Promise<void> => {
    await delay(2000); // Simulate upload time
    // console.log(`Mock: Uploaded ${file.name}`);
  },

  query: async (query: string, sessionId?: string): Promise<QueryResponse> => {
    await delay(1500); // Simulate processing time
    
    const newSessionId = sessionId || `session-${Date.now()}`;
    
    // Generate a mock answer with citations
    const answer = `Based on the uploaded documents, ${query.toLowerCase().includes("azure") ? "Azure OpenAI Service" : "the RAG system"} provides powerful capabilities for document intelligence.\n\nKey points:\n\n1. **Semantic Understanding**: The system uses embedding models to understand the meaning of your queries beyond just keywords [1].\n\n2. **Accurate Retrieval**: Documents are retrieved based on semantic similarity, ensuring the most relevant information is found [2].\n\n3. **Grounded Responses**: All answers are generated using retrieved context, providing factually accurate information with source citations [2].\n\nThis approach combines the best of retrieval and generation to deliver intelligent, trustworthy answers from your document collection [1][3].`;
    
    return {
      sessionId: newSessionId,
      messageId: `msg-${Date.now()}`,
      answer,
      sources: mockSources,
    };
  },

  getChatHistory: async (sessionId: string): Promise<{ messages: Message[] }> => {
    await delay(300);
    return { messages: mockMessages };
  },
};
