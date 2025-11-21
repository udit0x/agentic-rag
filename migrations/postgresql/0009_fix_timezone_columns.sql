-- Migration: Fix timezone columns
-- Created: 2025-11-17
-- Description: Convert all timestamp columns to timestamptz (timestamp with time zone)
-- This ensures all timestamps are stored in UTC and properly handled across timezones

-- Chat Sessions
ALTER TABLE chat_sessions 
  ALTER COLUMN last_message_at TYPE timestamptz USING last_message_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';

-- Config Versions
ALTER TABLE config_versions 
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN activated_at TYPE timestamptz USING activated_at AT TIME ZONE 'UTC';

-- Documents
ALTER TABLE documents 
  ALTER COLUMN uploaded_at TYPE timestamptz USING uploaded_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC',
  ALTER COLUMN processed_at TYPE timestamptz USING processed_at AT TIME ZONE 'UTC';

-- Document Processing Jobs
ALTER TABLE document_processing_jobs 
  ALTER COLUMN started_at TYPE timestamptz USING started_at AT TIME ZONE 'UTC',
  ALTER COLUMN completed_at TYPE timestamptz USING completed_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';

-- Messages
ALTER TABLE messages 
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';

-- Message Context
ALTER TABLE message_context 
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';

-- Message Feedback
ALTER TABLE message_feedback 
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';

-- Query Analytics
ALTER TABLE query_analytics 
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';

-- Users
ALTER TABLE users 
  ALTER COLUMN last_login_at TYPE timestamptz USING last_login_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';

-- Agent Traces
ALTER TABLE agent_traces 
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';

-- Update default values to use timezone-aware now()
ALTER TABLE chat_sessions ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE chat_sessions ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE config_versions ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE documents ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE documents ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE document_processing_jobs ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE document_processing_jobs ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE messages ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE message_context ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE message_feedback ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE message_feedback ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE query_analytics ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE users ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE users ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE agent_traces ALTER COLUMN created_at SET DEFAULT now();

-- Add comment for documentation
COMMENT ON COLUMN chat_sessions.created_at IS 'Timestamp with timezone (UTC)';
COMMENT ON COLUMN users.created_at IS 'Timestamp with timezone (UTC)';
COMMENT ON COLUMN messages.created_at IS 'Timestamp with timezone (UTC)';
