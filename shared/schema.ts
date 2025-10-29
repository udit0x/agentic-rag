import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Documents table - stores uploaded documents
export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  content: text("content").notNull(),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

// Document chunks table - stores embedded chunks for retrieval
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

// Chat sessions table - stores conversation history
export const chatSessions = pgTable("chat_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Messages table - stores individual chat messages
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Insert schemas
export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploadedAt: true,
});

export const insertDocumentChunkSchema = createInsertSchema(documentChunks).omit({
  id: true,
  createdAt: true,
});

export const insertChatSessionSchema = createInsertSchema(chatSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

// Types
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type InsertDocumentChunk = z.infer<typeof insertDocumentChunkSchema>;

export type ChatSession = typeof chatSessions.$inferSelect;
export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

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
};

export type ChatHistoryResponse = {
  sessionId: string;
  messages: Message[];
};
