-- Migration: Add user preference settings to users table
-- This allows per-user customization of RAG behavior and general settings

-- Add RAG behavior settings
ALTER TABLE users ADD COLUMN IF NOT EXISTS use_general_knowledge BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_relevance_threshold NUMERIC(3,2) DEFAULT 0.65;

-- Add comment for clarity
COMMENT ON COLUMN users.use_general_knowledge IS 'Allow AI to use built-in knowledge when no relevant documents found';
COMMENT ON COLUMN users.document_relevance_threshold IS 'Threshold for document retrieval relevance (0.1-0.95)';
