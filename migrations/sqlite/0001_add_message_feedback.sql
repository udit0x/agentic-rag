-- Migration: Add message feedback table for user response quality tracking and ML training
-- Created: 2025-11-11

CREATE TABLE IF NOT EXISTS "message_feedback" (
  "id" TEXT PRIMARY KEY,
  "message_id" TEXT NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "session_id" TEXT NOT NULL REFERENCES "chat_sessions"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "feedback_type" TEXT NOT NULL CHECK (feedback_type IN ('positive', 'negative')),
  "category" TEXT CHECK (category IN (
    'ignored_instructions',
    'fetched_multiple_documents',
    'harmful_offensive',
    'forgot_context',
    'missing_information',
    'other'
  )),
  "detail_text" TEXT,
  "query_context" TEXT, -- JSON stored as TEXT in SQLite
  "is_reviewed" INTEGER DEFAULT 0, -- BOOLEAN as INTEGER in SQLite
  "reviewed_by" TEXT,
  "reviewed_at" TEXT,
  "training_weight" REAL DEFAULT 1.0,
  "model_version" TEXT,
  "metadata" TEXT, -- JSON stored as TEXT in SQLite
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS "idx_message_feedback_message_id" ON "message_feedback"("message_id");
CREATE INDEX IF NOT EXISTS "idx_message_feedback_session_id" ON "message_feedback"("session_id");
CREATE INDEX IF NOT EXISTS "idx_message_feedback_user_id" ON "message_feedback"("user_id");
CREATE INDEX IF NOT EXISTS "idx_message_feedback_type" ON "message_feedback"("feedback_type");
CREATE INDEX IF NOT EXISTS "idx_message_feedback_category" ON "message_feedback"("category");
CREATE INDEX IF NOT EXISTS "idx_message_feedback_created_at" ON "message_feedback"("created_at");
CREATE INDEX IF NOT EXISTS "idx_message_feedback_is_reviewed" ON "message_feedback"("is_reviewed");

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_message_feedback_user_session" ON "message_feedback"("user_id", "session_id");
CREATE INDEX IF NOT EXISTS "idx_message_feedback_type_category" ON "message_feedback"("feedback_type", "category");

-- Unique constraint: One feedback per message per user
CREATE UNIQUE INDEX IF NOT EXISTS "idx_message_feedback_unique" ON "message_feedback"("message_id", "user_id");
