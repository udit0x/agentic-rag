import { z } from "zod";

// Common validation schemas and types
export const DocumentMetadata = z.object({
  page: z.number().optional(),
  section: z.string().optional(),
  startChar: z.number().optional(),
  endChar: z.number().optional(),
});

export const MessageSources = z.array(z.object({
  documentId: z.string(),
  chunkId: z.string(),
  filename: z.string(),
  excerpt: z.string(),
  score: z.number().optional(),
}));

// Agent execution trace data
export const AgentTraceData = z.object({
  agentName: z.string(),
  startTime: z.string(),
  endTime: z.string().optional(),
  durationMs: z.number().optional(),
  inputData: z.record(z.any()),
  outputData: z.record(z.any()).optional(),
  error: z.string().optional(),
});

// Query classification data
export const QueryClassificationData = z.object({
  type: z.enum(["factual", "counterfactual", "temporal", "general"]),
  confidence: z.number(),
  reasoning: z.string(),
  keywords: z.array(z.string()),
  temporalIndicators: z.array(z.string()).optional(),
  useGeneralKnowledge: z.boolean().optional(),
});

// Google OAuth user profile
export const GoogleUserProfile = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  picture: z.string().optional(),
  locale: z.string().optional(),
});

// Chat message context for efficient history management
export const MessageContext = z.object({
  messageId: z.string(),
  sessionId: z.string(),
  contextMessages: z.array(z.string()),
  tokenCount: z.number(),
  isContextBoundary: z.boolean(), // Marks context reset points
});

// Configuration management schema
export const ConfigVersion = z.object({
  version: z.string(),
  environment: z.string(),
  configData: z.record(z.any()),
  isActive: z.boolean(),
  createdBy: z.string().optional(),
});

// Database-agnostic base types
export type DocumentMetadataType = z.infer<typeof DocumentMetadata>;
export type MessageSourcesType = z.infer<typeof MessageSources>;
export type AgentTraceType = z.infer<typeof AgentTraceData>;
export type QueryClassificationType = z.infer<typeof QueryClassificationData>;
export type GoogleUserProfileType = z.infer<typeof GoogleUserProfile>;
export type MessageContextType = z.infer<typeof MessageContext>;
export type ConfigVersionType = z.infer<typeof ConfigVersion>;

// Helper functions for cross-database JSON handling
export const serializeJson = (data: any): string => JSON.stringify(data);
export const deserializeJson = <T>(data: string | null): T | null => 
  data ? JSON.parse(data) : null;

// UUID generation helper for databases that don't support gen_random_uuid()
export const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};