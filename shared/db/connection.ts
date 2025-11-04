import { drizzle } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzlePg } from "drizzle-orm/neon-http";
import Database from "better-sqlite3";
import { neon } from "@neondatabase/serverless";
import * as sqliteSchema from "../schemas/sqlite";
import * as postgresSchema from "../schemas/postgresql";
import fs from "fs";
import path from "path";

const DB_TYPE = process.env.DB_TYPE || "sqlite";

// PERFORMANCE OPTIMIZED: Connection pooling and caching
let dbConnection: any = null;

export const createConnection = () => {
  if (dbConnection) return dbConnection; // Reuse existing connection

  if (DB_TYPE === "sqlite") {
    const dbPath = process.env.DB_PATH || "./data/local.sqlite";
    console.log(`🗄️ Connecting to SQLite database: ${dbPath}`);
    
    // Create directory if it doesn't exist
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const sqlite = new Database(dbPath);
    
    // Performance optimizations for SQLite
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = NORMAL');
    sqlite.pragma('cache_size = 1000000');
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('temp_store = memory');
    
    dbConnection = drizzle(sqlite, { schema: sqliteSchema });
    console.log(`✅ Connected to SQLite database`);
  } else if (DB_TYPE === "postgresql") {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required for PostgreSQL");
    }
    
    console.log(`🗄️ Connecting to PostgreSQL database`);
    const sql = neon(databaseUrl);
    dbConnection = drizzlePg(sql, { schema: postgresSchema });
    console.log(`✅ Connected to PostgreSQL database`);
  } else {
    throw new Error(`Unsupported database type: ${DB_TYPE}. Use 'sqlite' or 'postgresql'`);
  }

  return dbConnection;
};

export const db = createConnection();

// PERFORMANCE: Create essential indexes for fast queries
export const createOptimizedIndexes = async () => {
  if (DB_TYPE === "sqlite") {
    const sqlite = (db as any).run;
    
    // Core indexes for fast queries
    console.log("🚀 Creating SQLite performance indexes...");
    
    // Message table indexes
    sqlite?.(`CREATE INDEX IF NOT EXISTS idx_messages_session_sequence ON messages(session_id, sequence_number)`);
    sqlite?.(`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`);
    sqlite?.(`CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role)`);
    
    // Document table indexes
    sqlite?.(`CREATE INDEX IF NOT EXISTS idx_documents_filename ON documents(filename)`);
    sqlite?.(`CREATE INDEX IF NOT EXISTS idx_documents_content_type ON documents(content_type)`);
    sqlite?.(`CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at)`);
    
    // Chunk table indexes
    sqlite?.(`CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id)`);
    sqlite?.(`CREATE INDEX IF NOT EXISTS idx_chunks_sequence ON chunks(document_id, sequence_number)`);
    
    // Chat session indexes
    sqlite?.(`CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at)`);
    sqlite?.(`CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id)`);
    
    // Analytics indexes
    sqlite?.(`CREATE INDEX IF NOT EXISTS idx_query_analytics_timestamp ON query_analytics(timestamp)`);
    sqlite?.(`CREATE INDEX IF NOT EXISTS idx_query_analytics_query_type ON query_analytics(query_type)`);
    sqlite?.(`CREATE INDEX IF NOT EXISTS idx_agent_traces_message_id ON agent_traces(message_id)`);
    sqlite?.(`CREATE INDEX IF NOT EXISTS idx_agent_traces_start_time ON agent_traces(start_time)`);
    
    // Composite indexes for common query patterns
    sqlite?.(`CREATE INDEX IF NOT EXISTS idx_messages_session_role_created ON messages(session_id, role, created_at)`);
    sqlite?.(`CREATE INDEX IF NOT EXISTS idx_analytics_time_type ON query_analytics(timestamp, query_type)`);
    
    console.log("✅ SQLite performance indexes created");
  }
};

// Helper to get the appropriate schema based on database type
export const getSchema = () => {
  return DB_TYPE === "sqlite" ? sqliteSchema : postgresSchema;
};

// Database type checking
export const isSQLite = () => DB_TYPE === "sqlite";
export const isPostgreSQL = () => DB_TYPE === "postgresql";

// Graceful connection cleanup
export const closeConnection = () => {
  if (dbConnection && isSQLite()) {
    (dbConnection as any).close?.();
    dbConnection = null;
    console.log("🔌 SQLite connection closed");
  }
};