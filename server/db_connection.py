"""Database connection utilities for Python."""
import os
import sqlite3
import asyncio
from pathlib import Path
from typing import Optional

class SQLiteConnection:
    """Async SQLite connection wrapper."""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._connection: Optional[sqlite3.Connection] = None
    
    async def connect(self):
        """Connect to the database."""
        if self._connection is None:
            # Create directory if it doesn't exist
            db_dir = Path(self.db_path).parent
            db_dir.mkdir(parents=True, exist_ok=True)
            
            # Connect to SQLite
            self._connection = sqlite3.connect(self.db_path, check_same_thread=False)
            self._connection.row_factory = sqlite3.Row  # Enable dict-like access
            
            # Performance optimizations
            self._connection.execute('PRAGMA journal_mode = WAL')
            self._connection.execute('PRAGMA synchronous = NORMAL')
            self._connection.execute('PRAGMA cache_size = 1000000')
            self._connection.execute('PRAGMA foreign_keys = ON')
            self._connection.execute('PRAGMA temp_store = memory')
            self._connection.commit()
    
    async def execute(self, query: str, params: tuple = ()):
        """Execute a query."""
        if self._connection is None:
            await self.connect()
        
        cursor = self._connection.execute(query, params)
        self._connection.commit()
        return cursor
    
    async def fetchone(self, query: str, params: tuple = ()):
        """Fetch one row."""
        cursor = await self.execute(query, params)
        return cursor.fetchone()
    
    async def fetchall(self, query: str, params: tuple = ()):
        """Fetch all rows."""
        cursor = await self.execute(query, params)
        return cursor.fetchall()
    
    async def close(self):
        """Close the connection."""
        if self._connection:
            self._connection.close()
            self._connection = None

# Global database connection
_db_connection: Optional[SQLiteConnection] = None

async def get_database():
    """Get the global database connection."""
    global _db_connection
    
    if _db_connection is None:
        db_path = os.getenv('DB_PATH', './data/local.sqlite')
        _db_connection = SQLiteConnection(db_path)
        await _db_connection.connect()
        
        # Run migrations if needed
        await run_migrations(_db_connection)
    
    return _db_connection

async def run_migrations(db: SQLiteConnection):
    """Run database migrations."""
    
    # Check if tables exist and create them if they don't
    tables_to_create = [
        """
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            content_type TEXT NOT NULL,
            size INTEGER NOT NULL,
            content TEXT NOT NULL,
            uploaded_at TEXT NOT NULL,
            user_id TEXT
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS document_chunks (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            metadata TEXT,
            embedding_id TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            picture TEXT,
            locale TEXT,
            preferences TEXT,
            last_login_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            is_active INTEGER DEFAULT 1
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS chat_sessions (
            id TEXT PRIMARY KEY,
            title TEXT,
            user_id TEXT,
            metadata TEXT,
            message_count INTEGER DEFAULT 0,
            last_message_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            sources TEXT,
            classification TEXT,
            agent_traces TEXT,
            execution_time_ms INTEGER,
            response_type TEXT,
            token_count INTEGER,
            context_window_used INTEGER,
            sequence_number INTEGER NOT NULL,
            parent_message_id TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS message_context (
            id TEXT PRIMARY KEY,
            message_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            context_messages TEXT,
            token_count INTEGER NOT NULL,
            is_context_boundary INTEGER DEFAULT 0,
            relevance_score REAL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS user_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            session_token TEXT NOT NULL UNIQUE,
            ip_address TEXT,
            user_agent TEXT,
            is_active INTEGER DEFAULT 1,
            expires_at TEXT NOT NULL,
            last_activity_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS query_analytics (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            user_id TEXT,
            query TEXT NOT NULL,
            classification TEXT,
            execution_time_ms INTEGER NOT NULL,
            agent_chain TEXT,
            source_documents TEXT,
            chunk_count INTEGER,
            relevance_score_avg REAL,
            response_type TEXT,
            error_message TEXT,
            token_usage TEXT,
            cache_hit INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS agent_traces (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            message_id TEXT,
            agent_name TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT,
            duration_ms INTEGER,
            input_data TEXT NOT NULL,
            output_data TEXT,
            error TEXT,
            parent_trace_id TEXT,
            execution_order INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id),
            FOREIGN KEY (message_id) REFERENCES messages(id)
        )
        """
    ]
    
    for table_sql in tables_to_create:
        await db.execute(table_sql)
    
    # Create indexes for performance
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_messages_session_sequence ON messages(session_id, sequence_number)",
        "CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id)",
        "CREATE INDEX IF NOT EXISTS idx_query_analytics_created_at ON query_analytics(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_agent_traces_message_id ON agent_traces(message_id)"
    ]
    
    for index_sql in indexes:
        await db.execute(index_sql)

async def close_database():
    """Close the database connection."""
    global _db_connection
    if _db_connection:
        await _db_connection.close()
        _db_connection = None