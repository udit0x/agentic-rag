-- Performance optimization indexes for SQLite database
-- These indexes improve query performance for common operations

-- Message table indexes
CREATE INDEX IF NOT EXISTS idx_messages_session_sequence 
  ON messages (session_id, sequence_number);

CREATE INDEX IF NOT EXISTS idx_messages_created_at 
  ON messages (created_at);

CREATE INDEX IF NOT EXISTS idx_messages_role 
  ON messages (role);

-- Document table indexes  
CREATE INDEX IF NOT EXISTS idx_documents_filename 
  ON documents (filename);

CREATE INDEX IF NOT EXISTS idx_documents_content_type 
  ON documents (content_type);

CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at 
  ON documents (uploaded_at);

-- Chunk table indexes
CREATE INDEX IF NOT EXISTS idx_chunks_document_id 
  ON chunks (document_id);

CREATE INDEX IF NOT EXISTS idx_chunks_sequence 
  ON chunks (document_id, sequence_number);

-- Chat session indexes
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at 
  ON chat_sessions (created_at);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id 
  ON chat_sessions (user_id);

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_query_analytics_timestamp 
  ON query_analytics (timestamp);

CREATE INDEX IF NOT EXISTS idx_query_analytics_query_type 
  ON query_analytics (query_type);

-- Agent trace indexes
CREATE INDEX IF NOT EXISTS idx_agent_traces_message_id 
  ON agent_traces (message_id);

CREATE INDEX IF NOT EXISTS idx_agent_traces_start_time 
  ON agent_traces (start_time);

CREATE INDEX IF NOT EXISTS idx_agent_traces_execution_order 
  ON agent_traces (execution_order);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_messages_session_role_created 
  ON messages (session_id, role, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_time_type 
  ON query_analytics (timestamp, query_type);

-- Full-text search indexes for content search
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  filename, 
  content, 
  content='documents', 
  content_rowid='id'
);

-- Triggers to keep FTS table in sync
CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid, filename, content) VALUES (new.id, new.filename, new.content);
END;

CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, filename, content) VALUES('delete', old.id, old.filename, old.content);
END;

CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, filename, content) VALUES('delete', old.id, old.filename, old.content);
  INSERT INTO documents_fts(rowid, filename, content) VALUES (new.id, new.filename, new.content);
END;