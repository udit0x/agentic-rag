import { pgTable, text, varchar, timestamp, integer, jsonb, boolean, numeric } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Core document storage
export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  content: text("content").notNull(),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  userId: varchar("user_id").references(() => users.id), // For Google OAuth
});

export const documentChunks = pgTable("document_chunks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<{
    page?: number;
    section?: string;
    startChar?: number;
    endChar?: number;
  }>(),
  embeddingId: text("embedding_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// User management for Google OAuth
export const users = pgTable("users", {
  id: varchar("id").primaryKey(), // Google user ID
  email: varchar("email").notNull().unique(),
  name: varchar("name").notNull(),
  picture: varchar("picture"),
  locale: varchar("locale"),
  preferences: jsonb("preferences"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isActive: boolean("is_active").default(true),
  // Quota management fields
  isUnlimited: boolean("is_unlimited").default(false),
  remainingQuota: integer("remaining_quota").default(50),
  apiKeyHash: text("api_key_hash"), // SHA-256 hash of user's personal API key (verification-only)
  // Enhanced personal API key storage (encrypted, can be used automatically)
  encryptedApiKey: text("encrypted_api_key"), // Fernet-encrypted personal API key
  apiKeyProvider: varchar("api_key_provider", { length: 20 }), // 'openai', 'azure', 'gemini'
});

// Enhanced chat sessions
export const chatSessions = pgTable("chat_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title"),
  userId: varchar("user_id").references(() => users.id),
  metadata: jsonb("metadata"), // Session configuration
  messageCount: integer("message_count").default(0),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Enhanced messages with analytics and context management
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  role: text("role").notNull().$type<"user" | "assistant">(),
  content: text("content").notNull(),
  sources: jsonb("sources").$type<Array<{
    documentId: string;
    chunkId: string;
    filename: string;
    excerpt: string;
    score?: number;
  }>>(),
  classification: jsonb("classification"), // QueryClassificationData
  agentTraces: jsonb("agent_traces"), // AgentTrace[]
  executionTimeMs: integer("execution_time_ms"),
  responseType: text("response_type").$type<"reasoning" | "simulation" | "temporal" | "general_knowledge" | "error">(),
  tokenCount: integer("token_count"),
  contextWindowUsed: integer("context_window_used"),
  sequenceNumber: integer("sequence_number").notNull(), // For ordering within session
  parentMessageId: varchar("parent_message_id"), // For threading
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Message context for efficient conversation history
export const messageContext = pgTable("message_context", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  sessionId: varchar("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  contextMessages: jsonb("context_messages").$type<string[]>(),
  tokenCount: integer("token_count").notNull(),
  isContextBoundary: boolean("is_context_boundary").default(false),
  relevanceScore: numeric("relevance_score"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Active user sessions for efficient session management
export const userSessions = pgTable("user_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionToken: varchar("session_token").notNull().unique(),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  isActive: boolean("is_active").default(true),
  expiresAt: timestamp("expires_at").notNull(),
  lastActivityAt: timestamp("last_activity_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Configuration version management (OPTIMIZED FOR FAST CONFIG LOADING)
export const configVersions = pgTable("config_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  version: varchar("version").notNull(),
  environment: varchar("environment").notNull(),
  configData: jsonb("config_data").notNull(),
  isActive: boolean("is_active").default(false),
  checksum: varchar("checksum"), // For integrity verification
  createdBy: varchar("created_by"),
  deployedBy: varchar("deployed_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  activatedAt: timestamp("activated_at"), // When this version became active
});

// Query analytics for performance tracking
export const queryAnalytics = pgTable("query_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => chatSessions.id),
  userId: varchar("user_id").references(() => users.id),
  query: text("query").notNull(),
  classification: jsonb("classification"), // QueryClassificationData
  executionTimeMs: integer("execution_time_ms").notNull(),
  agentChain: jsonb("agent_chain").$type<string[]>(),
  sourceDocuments: jsonb("source_documents").$type<string[]>(),
  chunkCount: integer("chunk_count"),
  relevanceScoreAvg: numeric("relevance_score_avg"),
  responseType: text("response_type"),
  errorMessage: text("error_message"),
  tokenUsage: jsonb("token_usage"),
  cacheHit: boolean("cache_hit").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Agent execution traces for debugging
export const agentTraces = pgTable("agent_traces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => chatSessions.id),
  messageId: varchar("message_id").references(() => messages.id),
  agentName: varchar("agent_name").notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  durationMs: integer("duration_ms"),
  inputData: jsonb("input_data").notNull(),
  outputData: jsonb("output_data"),
  error: text("error"),
  parentTraceId: varchar("parent_trace_id"), // For nested agent calls
  executionOrder: integer("execution_order").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Document processing jobs for async operations
export const documentProcessingJobs = pgTable("document_processing_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id),
  status: text("status").notNull().$type<"pending" | "processing" | "completed" | "failed">(),
  jobType: text("job_type").notNull().$type<"embedding" | "chunking" | "indexing">(),
  progress: integer("progress").default(0), // 0-100
  totalChunks: integer("total_chunks"),
  processedChunks: integer("processed_chunks").default(0),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// User feedback for response quality and ML training
export const messageFeedback = pgTable("message_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  sessionId: varchar("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  feedbackType: text("feedback_type").notNull().$type<"positive" | "negative">(),
  category: text("category").$type<
    | "ignored_instructions"
    | "fetched_multiple_documents"
    | "harmful_offensive"
    | "forgot_context"
    | "missing_information"
    | "other"
  >(), // Only for negative feedback
  detailText: text("detail_text"), // User's additional comments
  // Store context for future ML training
  queryContext: jsonb("query_context").$type<{
    originalQuery: string;
    responseType?: string;
    sourcesUsed?: string[];
    agentChain?: string[];
  }>(),
  // ML training fields (for future use)
  isReviewed: boolean("is_reviewed").default(false),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  trainingWeight: numeric("training_weight").default("1.0"), // For weighted training
  modelVersion: varchar("model_version"), // Track which model version received feedback
  // Metadata for analysis
  metadata: jsonb("metadata").$type<{
    userAgent?: string;
    responseTime?: number;
    tokenCount?: number;
    sourceCount?: number;
  }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
export const insertMessageFeedbackSchema = createInsertSchema(messageFeedback);

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

export type MessageFeedback = typeof messageFeedback.$inferSelect;
export type InsertMessageFeedback = typeof messageFeedback.$inferInsert;