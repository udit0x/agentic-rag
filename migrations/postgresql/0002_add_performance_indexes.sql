-- Migration: Add critical performance indexes
-- Date: 2025-11-11
-- Purpose: Fix slow queries for documents and optimize message fetching
-- Expected Impact: Reduce document fetch from ~2335ms to ~50ms

-- ⚡ Documents: Composite index for user's documents query
-- Query: SELECT * FROM documents WHERE user_id = $1 ORDER BY uploaded_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_user_uploaded 
  ON documents (user_id, uploaded_at DESC);

-- ⚡ Messages: Ensure session_id index exists for chat history queries
-- Query: SELECT * FROM messages WHERE session_id = $1 ORDER BY sequence_number ASC
-- Note: idx_messages_session_sequence should already exist, but verifying
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_session_sequence 
  ON messages (session_id, sequence_number ASC);

-- Update table statistics for query planner
ANALYZE documents;
ANALYZE messages;
ANALYZE chat_sessions;
