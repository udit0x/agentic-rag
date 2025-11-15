-- Migration: Add user quota management fields
-- Created: 2025-01-12
-- Description: Add quota management and API key fields for rate limiting

-- Add quota management columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_unlimited BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS remaining_quota INTEGER DEFAULT 50;
ALTER TABLE users ADD COLUMN IF NOT EXISTS api_key_hash TEXT;

-- Set owner account (uditkashyap29@gmail.com) to unlimited quota
UPDATE users 
SET is_unlimited = TRUE, 
    remaining_quota = NULL  -- NULL indicates unlimited
WHERE email = 'uditkashyap29@gmail.com';

-- Create index for faster quota checks
CREATE INDEX IF NOT EXISTS idx_users_quota ON users(id, remaining_quota, is_unlimited);

-- Add comment for documentation
COMMENT ON COLUMN users.is_unlimited IS 'If true, user has unlimited API quota (owner/admin)';
COMMENT ON COLUMN users.remaining_quota IS 'Number of remaining API messages. NULL for unlimited users.';
COMMENT ON COLUMN users.api_key_hash IS 'SHA-256 hash of user''s personal API key. If request uses this key, quota is not consumed.';
