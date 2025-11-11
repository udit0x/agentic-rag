-- Performance optimization indexes for PostgreSQL database
-- These indexes improve query performance for common operations

-- Message table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_session_sequence 
  ON messages (session_id, sequence_number);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_created_at 
  ON messages (created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_role 
  ON messages (role);

-- GIN indexes for JSON columns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_sources_gin 
  ON messages USING GIN (sources);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_classification_gin 
  ON messages USING GIN (classification);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_agent_traces_gin 
  ON messages USING GIN (agent_traces);

-- Document table indexes  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_filename 
  ON documents (filename);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_content_type 
  ON documents (content_type);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_uploaded_at 
  ON documents (uploaded_at);

-- ⚡ CRITICAL: Composite index for user's documents query (WHERE user_id = X ORDER BY uploaded_at DESC)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_user_uploaded 
  ON documents (user_id, uploaded_at DESC);

-- GIN index for document metadata
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_metadata_gin 
  ON documents USING GIN (metadata);

-- Chunk table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chunks_document_id 
  ON chunks (document_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chunks_sequence 
  ON chunks (document_id, sequence_number);

-- GIN index for chunk embeddings (if using vector extension)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chunks_embedding_gin 
--   ON chunks USING GIN (embedding);

-- Chat session indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_sessions_created_at 
  ON chat_sessions (created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_sessions_user_id 
  ON chat_sessions (user_id);

-- ⚡ CRITICAL: Composite index for common query pattern (WHERE user_id = X ORDER BY created_at DESC)
-- This will dramatically speed up session fetches from 1100ms -> ~10ms
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_sessions_user_created 
  ON chat_sessions (user_id, created_at DESC);

-- Analytics indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_analytics_timestamp 
  ON query_analytics (timestamp);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_analytics_query_type 
  ON query_analytics (query_type);

-- GIN indexes for JSON analytics fields
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_analytics_metadata_gin 
  ON query_analytics USING GIN (metadata);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_analytics_performance_gin 
  ON query_analytics USING GIN (performance_metrics);

-- Agent trace indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_traces_message_id 
  ON agent_traces (message_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_traces_start_time 
  ON agent_traces (start_time);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_traces_execution_order 
  ON agent_traces (execution_order);

-- GIN indexes for JSON trace data
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_traces_input_gin 
  ON agent_traces USING GIN (input_data);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_traces_output_gin 
  ON agent_traces USING GIN (output_data);

-- Composite indexes for common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_session_role_created 
  ON messages (session_id, role, created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_time_type 
  ON query_analytics (timestamp, query_type);

-- Partial indexes for specific conditions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_with_sources 
  ON messages (session_id, created_at) 
  WHERE sources IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_active_sessions 
  ON chat_sessions (created_at, user_id) 
  WHERE title IS NOT NULL;

-- Full-text search indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_content_fts 
  ON documents USING GIN (to_tsvector('english', content));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_filename_fts 
  ON documents USING GIN (to_tsvector('english', filename));

-- Statistics and maintenance
-- Update table statistics for better query planning
ANALYZE messages;
ANALYZE documents;
ANALYZE chunks;
ANALYZE chat_sessions;
ANALYZE query_analytics;
ANALYZE agent_traces;