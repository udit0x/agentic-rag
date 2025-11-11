-- Migration: Add message feedback table for user response quality tracking and ML training
-- Created: 2025-11-11

CREATE TABLE IF NOT EXISTS "message_feedback" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" VARCHAR NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "session_id" VARCHAR NOT NULL REFERENCES "chat_sessions"("id") ON DELETE CASCADE,
  "user_id" VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
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
  "query_context" JSONB,
  "is_reviewed" BOOLEAN DEFAULT false,
  "reviewed_by" VARCHAR,
  "reviewed_at" TIMESTAMP,
  "training_weight" NUMERIC DEFAULT 1.0,
  "model_version" VARCHAR,
  "metadata" JSONB,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
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

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_message_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_message_feedback_updated_at
  BEFORE UPDATE ON "message_feedback"
  FOR EACH ROW
  EXECUTE FUNCTION update_message_feedback_updated_at();

-- Comments for documentation
COMMENT ON TABLE "message_feedback" IS 'Stores user feedback on assistant responses for quality tracking and future ML training';
COMMENT ON COLUMN "message_feedback"."feedback_type" IS 'Type of feedback: positive (thumbs up) or negative (thumbs down)';
COMMENT ON COLUMN "message_feedback"."category" IS 'Specific issue category for negative feedback';
COMMENT ON COLUMN "message_feedback"."query_context" IS 'Stores context about the query and response for ML training';
COMMENT ON COLUMN "message_feedback"."training_weight" IS 'Weight for ML training (e.g., reviewed feedback might have higher weight)';
COMMENT ON COLUMN "message_feedback"."is_reviewed" IS 'Whether feedback has been reviewed by a human (for quality control)';
