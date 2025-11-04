import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Core document storage
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(), // Manual UUID generation
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  content: text("content").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
  userId: text("user_id"), // For future Google OAuth
});

export const documentChunks = sqliteTable("document_chunks", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  metadata: text("metadata"), // JSON string for SQLite
  embeddingId: text("embedding_id"),
  createdAt: text("created_at").notNull(),
});

// User management for Google OAuth
export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // Google user ID
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  picture: text("picture"),
  locale: text("locale"),
  preferences: text("preferences"), // JSON string
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
});

// Enhanced chat sessions
export const chatSessions = sqliteTable("chat_sessions", {
  id: text("id").primaryKey(),
  title: text("title"),
  userId: text("user_id").references(() => users.id),
  metadata: text("metadata"), // JSON string for session config
  messageCount: integer("message_count").default(0),
  lastMessageAt: text("last_message_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Enhanced messages with analytics and context management
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  sources: text("sources"), // JSON string
  classification: text("classification"), // JSON string for QueryClassificationData
  agentTraces: text("agent_traces"), // JSON string for AgentTrace[]
  executionTimeMs: integer("execution_time_ms"),
  responseType: text("response_type"), // "reasoning" | "simulation" | "temporal" | "general_knowledge" | "error"
  tokenCount: integer("token_count"),
  contextWindowUsed: integer("context_window_used"),
  sequenceNumber: integer("sequence_number").notNull(), // For ordering within session
  parentMessageId: text("parent_message_id"), // For threading
  createdAt: text("created_at").notNull(),
});

// Message context for efficient conversation history
export const messageContext = sqliteTable("message_context", {
  id: text("id").primaryKey(),
  messageId: text("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  contextMessages: text("context_messages"), // JSON array of message IDs
  tokenCount: integer("token_count").notNull(),
  isContextBoundary: integer("is_context_boundary", { mode: "boolean" }).default(false),
  relevanceScore: real("relevance_score"),
  createdAt: text("created_at").notNull(),
});

// Active user sessions for efficient session management
export const userSessions = sqliteTable("user_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionToken: text("session_token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  expiresAt: text("expires_at").notNull(),
  lastActivityAt: text("last_activity_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Configuration version management (OPTIMIZED FOR FAST CONFIG LOADING)
export const configVersions = sqliteTable("config_versions", {
  id: text("id").primaryKey(),
  version: text("version").notNull(),
  environment: text("environment").notNull(),
  configData: text("config_data").notNull(), // JSON string
  isActive: integer("is_active", { mode: "boolean" }).default(false),
  checksum: text("checksum"), // For integrity verification
  createdBy: text("created_by"),
  deployedBy: text("deployed_by"),
  createdAt: text("created_at").notNull(),
  activatedAt: text("activated_at"), // When this version became active
});

// Query analytics for performance tracking
export const queryAnalytics = sqliteTable("query_analytics", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").references(() => chatSessions.id),
  userId: text("user_id").references(() => users.id),
  query: text("query").notNull(),
  classification: text("classification"), // JSON string for QueryClassificationData
  executionTimeMs: integer("execution_time_ms").notNull(),
  agentChain: text("agent_chain"), // JSON array of agent names executed
  sourceDocuments: text("source_documents"), // JSON array of document IDs
  chunkCount: integer("chunk_count"),
  relevanceScoreAvg: real("relevance_score_avg"),
  responseType: text("response_type"),
  errorMessage: text("error_message"),
  tokenUsage: text("token_usage"), // JSON object for input/output tokens
  cacheHit: integer("cache_hit", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull(),
});

// Agent execution traces for debugging
export const agentTraces = sqliteTable("agent_traces", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").references(() => chatSessions.id),
  messageId: text("message_id").references(() => messages.id),
  agentName: text("agent_name").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time"),
  durationMs: integer("duration_ms"),
  inputData: text("input_data").notNull(), // JSON string
  outputData: text("output_data"), // JSON string
  error: text("error"),
  parentTraceId: text("parent_trace_id"), // For nested agent calls
  executionOrder: integer("execution_order").notNull(),
  createdAt: text("created_at").notNull(),
});

// Document processing jobs for async operations
export const documentProcessingJobs = sqliteTable("document_processing_jobs", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id),
  status: text("status").notNull(), // "pending" | "processing" | "completed" | "failed"
  jobType: text("job_type").notNull(), // "embedding" | "chunking" | "indexing"
  progress: integer("progress").default(0), // 0-100
  totalChunks: integer("total_chunks"),
  processedChunks: integer("processed_chunks").default(0),
  errorMessage: text("error_message"),
  metadata: text("metadata"), // JSON string for job-specific data
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
});

// Insert schemas
export const insertDocumentSchema = createInsertSchema(documents);
export const insertDocumentChunkSchema = createInsertSchema(documentChunks);
export const insertUserSchema = createInsertSchema(users);
export const insertChatSessionSchema = createInsertSchema(chatSessions);
export const insertMessageSchema = createInsertSchema(messages);
export const insertMessageContextSchema = createInsertSchema(messageContext);
export const insertUserSessionSchema = createInsertSchema(userSessions);
export const insertConfigVersionSchema = createInsertSchema(configVersions);
export const insertQueryAnalyticsSchema = createInsertSchema(queryAnalytics);
export const insertAgentTraceSchema = createInsertSchema(agentTraces);
export const insertDocumentProcessingJobSchema = createInsertSchema(documentProcessingJobs);

// Types
export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type InsertDocumentChunk = typeof documentChunks.$inferInsert;

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type ChatSession = typeof chatSessions.$inferSelect;
export type InsertChatSession = typeof chatSessions.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

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