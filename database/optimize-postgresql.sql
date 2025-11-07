-- PostgreSQL Database Optimization Script
-- This script creates essential indexes for optimal query performance
-- Based on query patterns analysis and PostgreSQL best practices

BEGIN;

-- ============================================================================
-- 1. FOREIGN KEY INDEXES (Critical for JOIN performance)
-- ============================================================================

-- Documents foreign keys
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_user_id 
    ON documents (user_id);

-- Document chunks foreign keys  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_document_id 
    ON document_chunks (document_id);

-- Chat sessions foreign keys
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_sessions_user_id 
    ON chat_sessions (user_id);

-- Messages foreign keys
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_session_id 
    ON messages (session_id);

-- Message context foreign keys
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_context_message_id 
    ON message_context (message_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_context_session_id 
    ON message_context (session_id);

-- User sessions foreign keys
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_user_id 
    ON user_sessions (user_id);

-- Query analytics foreign keys
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_analytics_session_id 
    ON query_analytics (session_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_analytics_user_id 
    ON query_analytics (user_id);

-- Agent traces foreign keys
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_traces_session_id 
    ON agent_traces (session_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_traces_message_id 
    ON agent_traces (message_id);

-- Document processing jobs foreign keys
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_doc_processing_jobs_document_id 
    ON document_processing_jobs (document_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_doc_processing_jobs_user_id 
    ON document_processing_jobs (user_id);

-- ============================================================================
-- 2. TIMESTAMP INDEXES (Critical for time-based queries)
-- ============================================================================

-- Document timestamps
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_uploaded_at 
    ON documents (uploaded_at DESC);

-- Chat session timestamps
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_sessions_created_at 
    ON chat_sessions (created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_sessions_updated_at 
    ON chat_sessions (updated_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_sessions_last_message_at 
    ON chat_sessions (last_message_at DESC);

-- Message timestamps
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_created_at 
    ON messages (created_at DESC);

-- Document chunks timestamps
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_created_at 
    ON document_chunks (created_at DESC);

-- Query analytics timestamps
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_analytics_created_at 
    ON query_analytics (created_at DESC);

-- Agent traces timestamps
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_traces_created_at 
    ON agent_traces (created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_traces_start_time 
    ON agent_traces (start_time DESC);

-- ============================================================================
-- 3. COMPOUND INDEXES (Optimized for common query patterns)
-- ============================================================================

-- Messages by session and sequence (critical for chat history)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_session_sequence 
    ON messages (session_id, sequence_number ASC);

-- Messages by session and timestamp
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_session_created 
    ON messages (session_id, created_at DESC);

-- Document chunks by document and sequence
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_doc_sequence 
    ON document_chunks (document_id, chunk_index ASC);

-- Chat sessions by user and timestamp
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_sessions_user_created 
    ON chat_sessions (user_id, created_at DESC);

-- Agent traces by message and execution order
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_traces_msg_order 
    ON agent_traces (message_id, execution_order ASC);

-- User sessions by user and activity
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_user_activity 
    ON user_sessions (user_id, last_activity_at DESC);

-- ============================================================================
-- 4. SEARCH AND FILTER INDEXES
-- ============================================================================

-- Document search indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_filename 
    ON documents (filename);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_content_type 
    ON documents (content_type);

-- Message role index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_role 
    ON messages (role);

-- Message response type index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_response_type 
    ON messages (response_type);

-- User email index (already exists as unique, but good to mention)
-- User active status index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_is_active 
    ON users (is_active) WHERE is_active = true;

-- User session active status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_active 
    ON user_sessions (is_active, expires_at) WHERE is_active = true;

-- Document processing job status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_doc_jobs_status 
    ON document_processing_jobs (status, created_at DESC);

-- ============================================================================
-- 5. JSONB INDEXES (GIN indexes for JSON operations)
-- ============================================================================

-- Message JSON fields
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_sources_gin 
    ON messages USING GIN (sources);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_classification_gin 
    ON messages USING GIN (classification);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_agent_traces_gin 
    ON messages USING GIN (agent_traces);

-- Chat session metadata
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_sessions_metadata_gin 
    ON chat_sessions USING GIN (metadata);

-- Document chunk metadata
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_metadata_gin 
    ON document_chunks USING GIN (metadata);

-- User preferences
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_preferences_gin 
    ON users USING GIN (preferences);

-- Query analytics JSON fields
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_analytics_classification_gin 
    ON query_analytics USING GIN (classification);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_analytics_agent_chain_gin 
    ON query_analytics USING GIN (agent_chain);

-- Agent traces JSON fields
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_traces_input_gin 
    ON agent_traces USING GIN (input_data);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_traces_output_gin 
    ON agent_traces USING GIN (output_data);

-- ============================================================================
-- 6. PARTIAL INDEXES (Space-efficient for specific conditions)
-- ============================================================================

-- Active chat sessions only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_sessions_active 
    ON chat_sessions (user_id, created_at DESC) 
    WHERE title IS NOT NULL;

-- Messages with sources only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_with_sources 
    ON messages (session_id, created_at DESC) 
    WHERE sources IS NOT NULL AND jsonb_array_length(sources) > 0;

-- Failed processing jobs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_doc_jobs_failed 
    ON document_processing_jobs (created_at DESC) 
    WHERE status = 'failed';

-- Incomplete processing jobs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_doc_jobs_incomplete 
    ON document_processing_jobs (created_at DESC) 
    WHERE status IN ('pending', 'processing');

-- ============================================================================
-- 7. FULL-TEXT SEARCH INDEXES
-- ============================================================================

-- Document content full-text search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_content_fts 
    ON documents USING GIN (to_tsvector('english', content));

-- Document filename full-text search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_filename_fts 
    ON documents USING GIN (to_tsvector('english', filename));

-- Message content full-text search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_content_fts 
    ON messages USING GIN (to_tsvector('english', content));

-- Chat session title full-text search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_sessions_title_fts 
    ON chat_sessions USING GIN (to_tsvector('english', title)) 
    WHERE title IS NOT NULL;

-- ============================================================================
-- 8. PERFORMANCE INDEXES (Query-specific optimizations)
-- ============================================================================

-- Most recent chat sessions per user
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recent_sessions_per_user 
    ON chat_sessions (user_id, last_message_at DESC NULLS LAST, created_at DESC);

-- Message count optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_count_per_session 
    ON messages (session_id) INCLUDE (created_at);

-- Document size optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_size 
    ON documents (size DESC) INCLUDE (uploaded_at);

-- Execution time analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_analytics_execution_time 
    ON query_analytics (execution_time_ms DESC, created_at DESC);

-- Agent performance tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_traces_duration 
    ON agent_traces (duration_ms DESC, agent_name) 
    WHERE duration_ms IS NOT NULL;

COMMIT;

-- ============================================================================
-- 9. UPDATE TABLE STATISTICS
-- ============================================================================

-- Analyze all tables to update query planner statistics
ANALYZE documents;
ANALYZE document_chunks;
ANALYZE users;
ANALYZE chat_sessions;
ANALYZE messages;
ANALYZE message_context;
ANALYZE user_sessions;
ANALYZE query_analytics;
ANALYZE agent_traces;
ANALYZE document_processing_jobs;
ANALYZE config_versions;

-- ============================================================================
-- 10. VACUUM AND MAINTENANCE
-- ============================================================================

-- Optional: Vacuum tables to reclaim space and update statistics
-- VACUUM ANALYZE documents;
-- VACUUM ANALYZE document_chunks;
-- VACUUM ANALYZE messages;
-- VACUUM ANALYZE chat_sessions;

-- Display index information
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;