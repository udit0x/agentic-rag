import * as sqliteSchema from "./schemas/sqlite";
import * as postgresSchema from "./schemas/postgresql";

// Environment-based schema exports
const DB_TYPE = process.env.DB_TYPE || "sqlite";

// Export schema based on database type
const schema = DB_TYPE === "sqlite" ? sqliteSchema : postgresSchema;

// Re-export all tables and types
export const {
  documents,
  documentChunks,
  chatSessions,
  messages,
  users,
  messageContext,
  userSessions,
  configVersions,
  queryAnalytics,
  agentTraces,
  documentProcessingJobs,
  
  // Insert schemas
  insertDocumentSchema,
  insertDocumentChunkSchema,
  insertChatSessionSchema,
  insertMessageSchema,
  insertUserSchema,
  insertMessageContextSchema,
  insertUserSessionSchema,
  insertConfigVersionSchema,
  insertQueryAnalyticsSchema,
  insertAgentTraceSchema,
  insertDocumentProcessingJobSchema,
} = schema;

// Re-export types
export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type InsertDocumentChunk = typeof documentChunks.$inferInsert;

export type ChatSession = typeof chatSessions.$inferSelect;
export type InsertChatSession = typeof chatSessions.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type MessageContext = typeof messageContext.$inferSelect;
export type InsertMessageContext = typeof messageContext.$inferInsert;

export type UserSession = typeof userSessions.$inferSelect;
export type InsertUserSession = typeof userSessions.$inferInsert;

export type ConfigVersion = typeof configVersions.$inferSelect;
export type InsertConfigVersion = typeof configVersions.$inferInsert;

export type QueryAnalytics = typeof queryAnalytics.$inferSelect;
export type InsertQueryAnalytics = typeof queryAnalytics.$inferInsert;

export type AgentTrace = typeof agentTraces.$inferSelect;
export type InsertAgentTrace = typeof agentTraces.$inferInsert;

export type DocumentProcessingJob = typeof documentProcessingJobs.$inferSelect;
export type InsertDocumentProcessingJob = typeof documentProcessingJobs.$inferInsert;

// API request/response types
export type UploadDocumentRequest = {
  filename: string;
  contentType: string;
  content: string;
};

export type UploadDocumentResponse = {
  documentId: string;
  filename: string;
  chunksCreated: number;
};

export type QueryRequest = {
  sessionId?: string;
  query: string;
  topK?: number;
  enableTracing?: boolean;
  debugMode?: boolean;
};

export type QueryClassification = {
  type: "factual" | "counterfactual" | "temporal" | "general";
  confidence: number;
  reasoning: string;
  keywords: string[];
  temporal_indicators?: string[];
  use_general_knowledge?: boolean;
};

export type AgentTraceType = {
  agentName: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  inputData: Record<string, any>;
  outputData?: Record<string, any>;
  error?: string;
};

export type QueryResponse = {
  sessionId: string;
  messageId: string;
  answer: string;
  sources: Array<{
    documentId: string;
    chunkId: string;
    filename: string;
    excerpt: string;
    score: number;
  }>;
  classification?: QueryClassification;
  agentTraces?: AgentTraceType[];
  executionTimeMs?: number;
  responseType?: "reasoning" | "simulation" | "temporal" | "general_knowledge" | "error";
};

export type ChatHistoryResponse = {
  sessionId: string;
  messages: Message[];
};
