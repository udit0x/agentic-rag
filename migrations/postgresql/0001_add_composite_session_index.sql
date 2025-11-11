-- Migration: Add composite index for session queries
-- Date: 2025-11-11
-- Purpose: Optimize chat_sessions query performance (WHERE user_id = X ORDER BY created_at DESC)
-- Expected Impact: Reduce session fetch time from ~1100ms to ~10ms

-- Create composite index on (user_id, created_at DESC)
-- CONCURRENTLY allows index creation without blocking writes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_sessions_user_created 
  ON chat_sessions (user_id, created_at DESC);

-- Verify index was created
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'chat_sessions' AND indexname = 'idx_chat_sessions_user_created';

-- Update table statistics for query planner
ANALYZE chat_sessions;
