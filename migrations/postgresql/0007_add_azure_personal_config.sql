-- Migration: Add Azure-specific personal configuration fields
-- When users save personal Azure API keys, we need to store endpoint and deployment info

-- Add Azure endpoint and deployment columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS azure_endpoint TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS azure_deployment_name TEXT;

-- Add comments
COMMENT ON COLUMN users.azure_endpoint IS 'Azure OpenAI endpoint URL for personal API key';
COMMENT ON COLUMN users.azure_deployment_name IS 'Azure OpenAI deployment name for personal API key';
