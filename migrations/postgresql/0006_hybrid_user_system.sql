-- Migration 0006: Hybrid User System (Backend Keys + Optional User Keys)
-- Adds user preferences and optional encrypted personal API keys

-- Add user preference columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme VARCHAR(10) DEFAULT 'system';
ALTER TABLE users ADD COLUMN IF NOT EXISTS enable_animations BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS enable_keyboard_shortcuts BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS temperature NUMERIC(3,2) DEFAULT 0.7;
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_tokens INTEGER DEFAULT 2000;

-- Add optional personal API key columns (encrypted storage)
ALTER TABLE users ADD COLUMN IF NOT EXISTS encrypted_api_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS api_key_provider VARCHAR(20);

-- Index for quick lookup of users with personal keys
CREATE INDEX IF NOT EXISTS idx_users_has_personal_key 
ON users(id) WHERE encrypted_api_key IS NOT NULL;

-- Comments for clarity
COMMENT ON COLUMN users.encrypted_api_key IS 'Optional: User personal API key (Fernet encrypted). If set, bypasses quota.';
COMMENT ON COLUMN users.api_key_provider IS 'Provider for personal key: openai, azure, gemini';
COMMENT ON COLUMN users.theme IS 'UI theme preference: light, dark, system';
COMMENT ON COLUMN users.temperature IS 'LLM temperature preference (0.0-2.0)';
COMMENT ON COLUMN users.max_tokens IS 'Max tokens preference for responses';
COMMENT ON COLUMN users.remaining_quota IS 'Messages remaining for free tier (50 default)';
COMMENT ON COLUMN users.is_unlimited IS 'True for owner (uditkashyap29@gmail.com), bypasses quota';
