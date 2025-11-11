"""PostgreSQL database connection and operations for Python."""
import os
import json
import asyncio
import asyncpg
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path
import uuid

class PostgreSQLConnection:
    """Async PostgreSQL connection wrapper with singleton pattern."""
    
    _instance = None
    _pool = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(PostgreSQLConnection, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, 'database_url'):
            self.database_url = os.getenv('DATABASE_URL')
            if not self.database_url:
                raise ValueError("DATABASE_URL environment variable is required for PostgreSQL")
    
    async def connect(self):
        """Connect to the PostgreSQL database."""
        if PostgreSQLConnection._pool is not None:
            return
            
        try:
            # Parse DATABASE_URL to handle special characters and validation
            import urllib.parse
            parsed_url = urllib.parse.urlparse(self.database_url)
            
            # Validate required components
            if not all([parsed_url.hostname, parsed_url.username, parsed_url.password]):
                raise ValueError(f"Invalid DATABASE_URL format: missing required components")
            
            print(f"[Database] Connecting to PostgreSQL at {parsed_url.hostname}:{parsed_url.port or 5432}")
            
            # Create connection pool with explicit connection parameters
            # ⚡ OPTIMIZED: Increased pool size and timeout for Azure PostgreSQL
            PostgreSQLConnection._pool = await asyncpg.create_pool(
                host=parsed_url.hostname,
                port=parsed_url.port or 5432,
                user=parsed_url.username,
                password=parsed_url.password,
                database=parsed_url.path[1:] if parsed_url.path else 'postgres',  # Remove leading /
                ssl='require',  # Force SSL for Azure PostgreSQL
                min_size=2,      # Increased from 1 (keep connections warm)
                max_size=20,     # Increased from 10 (handle concurrent requests)
                command_timeout=120,  # Increased from 60 (long-running queries)
                server_settings={
                    'application_name': 'agentic-rag-python',
                }
            )
            print(f"[Database] PostgreSQL connection established")
            
        except Exception as e:
            print(f"[Database] Connection failed: {e}")
            raise
    
    async def ensure_tables_exist(self):
        """Ensure all required tables exist."""
        # The tables should already be created by the TypeScript side via Drizzle
        # This is just a silent verification step
        async with PostgreSQLConnection._pool.acquire() as conn:
            # Check if the main tables exist
            tables_to_check = [
                'documents', 'document_chunks', 'users', 'chat_sessions', 
                'messages', 'message_context', 'user_sessions', 'query_analytics', 
                'agent_traces', 'document_processing_jobs'
            ]
            
            missing_tables = []
            for table in tables_to_check:
                result = await conn.fetchval(
                    "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)",
                    table
                )
                if not result:
                    missing_tables.append(table)
            
            if missing_tables:
                print(f"[Database] Warning: Missing tables: {', '.join(missing_tables)}")
    
    async def execute(self, query: str, *args):
        """Execute a query."""
        if PostgreSQLConnection._pool is None:
            await self.connect()
        
        async with PostgreSQLConnection._pool.acquire() as conn:
            return await conn.execute(query, *args)
    
    async def fetchone(self, query: str, *args):
        """Fetch one row."""
        if PostgreSQLConnection._pool is None:
            await self.connect()
        
        async with PostgreSQLConnection._pool.acquire() as conn:
            return await conn.fetchrow(query, *args)
    
    async def fetchall(self, query: str, *args):
        """Fetch all rows."""
        if PostgreSQLConnection._pool is None:
            await self.connect()
        
        async with PostgreSQLConnection._pool.acquire() as conn:
            return await conn.fetch(query, *args)
    
    async def close(self):
        """Close the connection pool."""
        if PostgreSQLConnection._pool:
            await PostgreSQLConnection._pool.close()
            PostgreSQLConnection._pool = None

class PostgreSQLStorage:
    """PostgreSQL storage implementation matching the SQLite interface."""
    
    _instance = None
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(PostgreSQLStorage, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        # Only initialize db connection once
        if not hasattr(self, 'db'):
            self.db = PostgreSQLConnection()
    
    async def initialize(self):
        """Initialize the database connection."""
        if not PostgreSQLStorage._initialized:
            await self.db.connect()
            await self.db.ensure_tables_exist()
            PostgreSQLStorage._initialized = True
    
    def _convert_row_to_dict(self, row) -> dict:
        """Convert database row to dictionary with camelCase field names."""
        if not row:
            return {}
        
        # Convert snake_case to camelCase for API compatibility
        field_mapping = {
            'uploaded_at': 'uploadedAt',
            'created_at': 'createdAt',
            'updated_at': 'updatedAt',
            'content_type': 'contentType',
            'chunk_index': 'chunkIndex',
            'document_id': 'documentId',
            'user_id': 'userId',
            'session_id': 'sessionId',
            'message_id': 'messageId',
            'last_message_at': 'lastMessageAt',
            'last_login_at': 'lastLoginAt',
            'is_active': 'isActive',
            'execution_time_ms': 'executionTimeMs',
            'response_type': 'responseType',
            'token_count': 'tokenCount',
            'context_window_used': 'contextWindowUsed',
            'sequence_number': 'sequenceNumber',
            'parent_message_id': 'parentMessageId',
            'agent_traces': 'agentTraces',
            'embedding_id': 'embeddingId',
            'message_count': 'messageCount',
        }
        
        # Fields that should be parsed from JSON strings to objects
        json_fields = {
            'metadata', 'sources', 'classification', 'agent_traces', 'agentTraces', 'preferences'
        }
        
        result = {}
        for key, value in dict(row).items():
            # Convert snake_case to camelCase if mapping exists
            new_key = field_mapping.get(key, key)
            
            # Parse JSON fields
            if new_key in json_fields and value is not None and isinstance(value, str):
                try:
                    import json as json_lib
                    result[new_key] = json_lib.loads(value)
                except (json_lib.JSONDecodeError, TypeError):
                    result[new_key] = value
            else:
                result[new_key] = value
        
        return result
    
    # Document operations
    async def createDocument(self, data: dict) -> dict:
        """Create a new document."""
        doc_id = data.get('id', str(uuid.uuid4()))
        
        await self.db.execute("""
            INSERT INTO documents (id, filename, content_type, size, content, uploaded_at, user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        """, doc_id, data['filename'], data['contentType'], data['size'], 
            data['content'], datetime.now(), data.get('userId'))
        
        return await self.getDocument(doc_id)
    
    async def getDocument(self, doc_id: str) -> Optional[dict]:
        """Get a document by ID."""
        row = await self.db.fetchone(
            "SELECT * FROM documents WHERE id = $1", doc_id
        )
        return self._convert_row_to_dict(row) if row else None
    
    async def getAllDocuments(self, userId: Optional[str] = None) -> List[dict]:
        """Get all documents, optionally filtered by userId."""
        if userId:
            rows = await self.db.fetchall(
                "SELECT * FROM documents WHERE user_id = $1 ORDER BY uploaded_at DESC",
                userId
            )
        else:
            rows = await self.db.fetchall("SELECT * FROM documents ORDER BY uploaded_at DESC")
        return [self._convert_row_to_dict(row) for row in rows]
    
    async def deleteDocument(self, doc_id: str) -> None:
        """Delete a document and its chunks."""
        await self.db.execute("DELETE FROM documents WHERE id = $1", doc_id)
    
    # Document chunk operations
    async def createDocumentChunk(self, data: dict) -> dict:
        """Create a new document chunk."""
        chunk_id = data.get('id', str(uuid.uuid4()))
        
        await self.db.execute("""
            INSERT INTO document_chunks (id, document_id, chunk_index, content, metadata, embedding_id, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        """, chunk_id, data['documentId'], data['chunkIndex'], data['content'],
            json.dumps(data.get('metadata', {})), data.get('embeddingId'), datetime.now())
        
        row = await self.db.fetchone("SELECT * FROM document_chunks WHERE id = $1", chunk_id)
        return self._convert_row_to_dict(row)
    
    async def getDocumentChunks(self, document_id: str) -> List[dict]:
        """Get all chunks for a document."""
        rows = await self.db.fetchall(
            "SELECT * FROM document_chunks WHERE document_id = $1 ORDER BY chunk_index", 
            document_id
        )
        return [self._convert_row_to_dict(row) for row in rows]
    
    async def getAllChunks(self) -> List[dict]:
        """Get all chunks."""
        rows = await self.db.fetchall("SELECT * FROM document_chunks ORDER BY created_at")
        return [self._convert_row_to_dict(row) for row in rows]
    
    async def updateChunkEmbeddingId(self, chunk_id: str, embedding_id: str) -> None:
        """Update the embedding ID for a chunk."""
        await self.db.execute(
            "UPDATE document_chunks SET embedding_id = $1 WHERE id = $2",
            embedding_id, chunk_id
        )

    async def createDocumentChunksBatch(self, chunks_data: List[dict]) -> List[dict]:
        """Create multiple document chunks in a single batch operation."""
        if not chunks_data:
            return []
        
        chunk_records = []
        
        # Prepare batch insert data
        insert_values = []
        for i, data in enumerate(chunks_data):
            chunk_id = str(uuid.uuid4())
            now = datetime.now()
            
            chunk_records.append({
                "id": chunk_id,
                "documentId": data["documentId"],
                "content": data["content"],
                "chunkIndex": data.get("chunkIndex", 0),
                "metadata": data.get("metadata", {}),
                "embeddingId": data.get("embeddingId"),
                "createdAt": now.isoformat()
            })
            
            insert_values.append(f"(${i*7+1}, ${i*7+2}, ${i*7+3}, ${i*7+4}, ${i*7+5}, ${i*7+6}, ${i*7+7})")
        
        # Build dynamic query with correct number of parameters
        placeholders = ", ".join(insert_values)
        query = f"""
            INSERT INTO document_chunks (id, document_id, chunk_index, content, metadata, embedding_id, created_at)
            VALUES {placeholders}
        """
        
        # Flatten the parameters for the query
        params = []
        for i, (data, record) in enumerate(zip(chunks_data, chunk_records)):
            params.extend([
                record["id"],
                data["documentId"],
                data.get("chunkIndex", 0),
                data["content"],
                json.dumps(data.get("metadata", {})),
                data.get("embeddingId"),
                datetime.now()  # Use datetime object, not string
            ])
        
        await self.db.execute(query, *params)
        return chunk_records

    async def updateChunkEmbeddingIdsBatch(self, chunk_embedding_pairs: List[tuple]) -> None:
        """Update embedding IDs for multiple chunks in a single batch operation."""
        if not chunk_embedding_pairs:
            return
        
        # PostgreSQL doesn't have executemany, so we'll use a different approach
        # Build a single UPDATE query with CASE statements
        if len(chunk_embedding_pairs) == 1:
            # Single update for just one pair
            embedding_id, chunk_id = chunk_embedding_pairs[0]
            await self.db.execute(
                "UPDATE document_chunks SET embedding_id = $1 WHERE id = $2",
                embedding_id, chunk_id
            )
        else:
            # Multiple updates using VALUES clause
            values_list = []
            params = []
            for i, (embedding_id, chunk_id) in enumerate(chunk_embedding_pairs):
                values_list.append(f"(${i*2+1}, ${i*2+2})")
                params.extend([embedding_id, chunk_id])
            
            values_clause = ", ".join(values_list)
            query = f"""
                UPDATE document_chunks 
                SET embedding_id = updates.embedding_id
                FROM (VALUES {values_clause}) AS updates(embedding_id, chunk_id)
                WHERE document_chunks.id = updates.chunk_id
            """
            
            await self.db.execute(query, *params)
    
    # Chat session operations
    async def createChatSession(self, data: dict) -> dict:
        """Create a new chat session."""
        session_id = data.get('id', str(uuid.uuid4()))
        
        await self.db.execute("""
            INSERT INTO chat_sessions (id, title, user_id, metadata, message_count, last_message_at, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """, session_id, data.get('title'), data.get('userId'), 
            json.dumps(data.get('metadata', {})), 0, None, datetime.now(), datetime.now())
        
        return await self.getChatSession(session_id)
    
    async def getChatSession(self, session_id: str) -> Optional[dict]:
        """Get a chat session by ID."""
        row = await self.db.fetchone(
            "SELECT * FROM chat_sessions WHERE id = $1", session_id
        )
        return self._convert_row_to_dict(row) if row else None
    
    async def getAllChatSessions(self, userId: Optional[str] = None, search: Optional[str] = None) -> List[dict]:
        """
        Get all chat sessions with optional filtering.
        
        ⚡ OPTIMIZED: Uses LEFT JOIN to fetch message counts in a single query
        instead of N+1 queries (one per session). This reduces 10+ queries to just 1.
        """
        query = """
            SELECT cs.*, 
                   COUNT(m.id) as message_count,
                   MAX(m.created_at) as last_message_at
            FROM chat_sessions cs
            LEFT JOIN messages m ON cs.id = m.session_id
        """
        args = []
        conditions = []
        
        if userId:
            conditions.append("cs.user_id = $" + str(len(args) + 1))
            args.append(userId)
        
        if search:
            conditions.append("(cs.title ILIKE $" + str(len(args) + 1) + ")")
            args.append(f"%{search}%")
        
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        
        query += " GROUP BY cs.id ORDER BY cs.created_at DESC"
        
        rows = await self.db.fetchall(query, *args)
        return [self._convert_row_to_dict(row) for row in rows]
    
    async def updateChatSession(self, session_id: str, data: dict) -> dict:
        """Update a chat session."""
        update_fields = []
        args = []
        
        for key, value in data.items():
            if key in ['title', 'metadata', 'message_count', 'last_message_at']:
                update_fields.append(f"{key} = ${len(args) + 1}")
                args.append(json.dumps(value) if key == 'metadata' else value)
        
        if update_fields:
            update_fields.append(f"updated_at = ${len(args) + 1}")
            args.append(datetime.now())
            args.append(session_id)
            
            await self.db.execute(
                f"UPDATE chat_sessions SET {', '.join(update_fields)} WHERE id = ${len(args)}",
                *args
            )
        
        return await self.getChatSession(session_id)
    
    async def deleteChatSession(self, session_id: str) -> None:
        """Delete a chat session and all its messages."""
        await self.db.execute("DELETE FROM chat_sessions WHERE id = $1", session_id)
    
    async def getChatSessionMetadata(self, session_id: str) -> dict:
        """Get metadata for a chat session including message count and last message."""
        row = await self.db.fetchone("""
            SELECT cs.*, COUNT(m.id) as actual_message_count,
                   MAX(m.created_at) as last_message_time
            FROM chat_sessions cs
            LEFT JOIN messages m ON cs.id = m.session_id
            WHERE cs.id = $1
            GROUP BY cs.id
        """, session_id)
        
        return self._convert_row_to_dict(row) if row else {}
    
    # Message operations
    async def createMessage(self, data: dict) -> dict:
        """Create a new message."""
        message_id = data.get('id', str(uuid.uuid4()))
        
        # Get next sequence number
        seq_result = await self.db.fetchone(
            "SELECT COALESCE(MAX(sequence_number), 0) + 1 FROM messages WHERE session_id = $1",
            data['sessionId']
        )
        sequence_number = seq_result[0] if seq_result else 1
        
        await self.db.execute("""
            INSERT INTO messages (
                id, session_id, role, content, sources, classification, agent_traces,
                execution_time_ms, response_type, token_count, context_window_used,
                sequence_number, parent_message_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        """, message_id, data['sessionId'], data['role'], data['content'],
            json.dumps(data.get('sources', [])), json.dumps(data.get('classification')),
            json.dumps(data.get('agentTraces', [])), data.get('executionTimeMs'),
            data.get('responseType'), data.get('tokenCount'), data.get('contextWindowUsed'),
            sequence_number, data.get('parentMessageId'), datetime.now())
        
        # Update session's message count and last message time
        await self.db.execute("""
            UPDATE chat_sessions 
            SET message_count = message_count + 1, 
                last_message_at = $1, 
                updated_at = $1 
            WHERE id = $2
        """, datetime.now(), data['sessionId'])
        
        row = await self.db.fetchone("SELECT * FROM messages WHERE id = $1", message_id)
        return self._convert_row_to_dict(row)
    
    async def getSessionMessages(self, session_id: str, page: int = 1, limit: int = 50) -> List[dict]:
        """Get messages for a session with pagination."""
        offset = (page - 1) * limit
        rows = await self.db.fetchall("""
            SELECT * FROM messages 
            WHERE session_id = $1 
            ORDER BY sequence_number ASC 
            LIMIT $2 OFFSET $3
        """, session_id, limit, offset)
        
        return [self._convert_row_to_dict(row) for row in rows]
    
    async def getSessionMessageCount(self, session_id: str) -> int:
        """Get total message count for a session."""
        result = await self.db.fetchone(
            "SELECT COUNT(*) FROM messages WHERE session_id = $1", session_id
        )
        return result[0] if result else 0
    
    async def clearSessionMessages(self, session_id: str) -> None:
        """Clear all messages from a session."""
        await self.db.execute("DELETE FROM messages WHERE session_id = $1", session_id)
        await self.db.execute("""
            UPDATE chat_sessions 
            SET message_count = 0, 
                last_message_at = NULL, 
                updated_at = $1 
            WHERE id = $2
        """, datetime.now(), session_id)
    
    async def getChatStatistics(self, userId: Optional[str] = None) -> dict:
        """Get chat statistics."""
        where_clause = "WHERE cs.user_id = $1" if userId else ""
        args = [userId] if userId else []
        
        row = await self.db.fetchone(f"""
            SELECT 
                COUNT(DISTINCT cs.id) as total_sessions,
                COUNT(m.id) as total_messages,
                AVG(cs.message_count) as avg_messages_per_session
            FROM chat_sessions cs
            LEFT JOIN messages m ON cs.id = m.session_id
            {where_clause}
        """, *args)
        
        return self._convert_row_to_dict(row) if row else {"total_sessions": 0, "total_messages": 0, "avg_messages_per_session": 0}
    
    # ==================== USER MANAGEMENT ====================
    
    async def createUser(self, data: dict) -> dict:
        """Create a new user."""
        import uuid
        user_id = data.get('id') or str(uuid.uuid4())
        
        await self.db.execute("""
            INSERT INTO users (
                id, email, name, picture, locale, preferences, 
                last_login_at, created_at, updated_at, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        """, user_id, data['email'], data['name'], data.get('picture'),
            data.get('locale', 'en'), json.dumps(data.get('preferences', {})),
            data.get('lastLoginAt') or datetime.now(), datetime.now(), datetime.now(), True)
        
        row = await self.db.fetchone("SELECT * FROM users WHERE id = $1", user_id)
        return self._convert_row_to_dict(row)
    
    async def getUser(self, user_id: str) -> dict | None:
        """Get a user by ID."""
        row = await self.db.fetchone("SELECT * FROM users WHERE id = $1", user_id)
        return self._convert_row_to_dict(row) if row else None
    
    async def getUserByEmail(self, email: str) -> dict | None:
        """Get a user by email."""
        row = await self.db.fetchone("SELECT * FROM users WHERE email = $1", email)
        return self._convert_row_to_dict(row) if row else None
    
    async def updateUser(self, user_id: str, data: dict) -> dict:
        """Update a user's information."""
        update_fields = []
        values = []
        param_count = 1
        
        if 'name' in data:
            update_fields.append(f"name = ${param_count}")
            values.append(data['name'])
            param_count += 1
        if 'picture' in data:
            update_fields.append(f"picture = ${param_count}")
            values.append(data['picture'])
            param_count += 1
        if 'locale' in data:
            update_fields.append(f"locale = ${param_count}")
            values.append(data['locale'])
            param_count += 1
        if 'preferences' in data:
            update_fields.append(f"preferences = ${param_count}")
            values.append(json.dumps(data['preferences']))
            param_count += 1
        if 'lastLoginAt' in data:
            update_fields.append(f"last_login_at = ${param_count}")
            values.append(data['lastLoginAt'])
            param_count += 1
        
        update_fields.append(f"updated_at = ${param_count}")
        values.append(datetime.now())
        param_count += 1
        
        values.append(user_id)
        
        query = f"UPDATE users SET {', '.join(update_fields)} WHERE id = ${param_count}"
        await self.db.execute(query, *values)
        
        row = await self.db.fetchone("SELECT * FROM users WHERE id = $1", user_id)
        return self._convert_row_to_dict(row)
    
    async def getAllUsers(self, search: str | None = None, active_only: bool = True, page: int = 1, limit: int = 20) -> List[dict]:
        """Get all users with optional filtering."""
        conditions = []
        args = []
        param_count = 1
        
        if active_only:
            conditions.append("is_active = true")
        
        if search:
            conditions.append(f"(name ILIKE ${param_count} OR email ILIKE ${param_count})")
            args.append(f"%{search}%")
            param_count += 1
        
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        offset = (page - 1) * limit
        
        args.extend([limit, offset])
        
        rows = await self.db.fetchall(f"""
            SELECT * FROM users 
            {where_clause}
            ORDER BY created_at DESC
            LIMIT ${param_count} OFFSET ${param_count + 1}
        """, *args)
        
        return [self._convert_row_to_dict(row) for row in rows]
    
    async def getUserCount(self, search: str | None = None, active_only: bool = True) -> int:
        """Get total user count."""
        conditions = []
        args = []
        param_count = 1
        
        if active_only:
            conditions.append("is_active = true")
        
        if search:
            conditions.append(f"(name ILIKE ${param_count} OR email ILIKE ${param_count})")
            args.append(f"%{search}%")
        
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        
        result = await self.db.fetchone(f"SELECT COUNT(*) FROM users {where_clause}", *args)
        return result[0] if result else 0
    
    # Message feedback operations
    async def create_message_feedback(
        self,
        message_id: str,
        session_id: str,
        user_id: str,
        feedback_type: str,
        category: str | None = None,
        detail_text: str | None = None,
        query_context: dict | None = None,
        metadata: dict | None = None
    ) -> str:
        """Create a new message feedback entry."""
        feedback_id = str(uuid.uuid4())
        
        await self.db.execute("""
            INSERT INTO message_feedback (
                id, message_id, session_id, user_id, feedback_type,
                category, detail_text, query_context, metadata, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        """, feedback_id, message_id, session_id, user_id, feedback_type,
            category, detail_text, json.dumps(query_context) if query_context else None,
            json.dumps(metadata) if metadata else None
        )
        
        return feedback_id
    
    async def get_message_feedback(self, message_id: str, user_id: str) -> dict | None:
        """Get feedback for a specific message by a specific user."""
        row = await self.db.fetchone("""
            SELECT * FROM message_feedback 
            WHERE message_id = $1 AND user_id = $2
        """, message_id, user_id)
        
        return self._convert_row_to_dict(row) if row else None
    
    async def update_message_feedback(
        self,
        feedback_id: str,
        feedback_type: str,
        category: str | None = None,
        detail_text: str | None = None,
        query_context: dict | None = None,
        metadata: dict | None = None
    ) -> str:
        """Update an existing message feedback entry."""
        await self.db.execute("""
            UPDATE message_feedback
            SET feedback_type = $1, category = $2, detail_text = $3,
                query_context = $4, metadata = $5, updated_at = NOW()
            WHERE id = $6
        """, feedback_type, category, detail_text,
            json.dumps(query_context) if query_context else None,
            json.dumps(metadata) if metadata else None,
            feedback_id
        )
        
        return feedback_id
    
    async def delete_message_feedback(self, feedback_id: str) -> None:
        """Delete a message feedback entry."""
        await self.db.execute("DELETE FROM message_feedback WHERE id = $1", feedback_id)
    
    async def get_session_feedback(self, session_id: str) -> List[dict]:
        """Get all feedback for a session."""
        rows = await self.db.fetchall("""
            SELECT * FROM message_feedback 
            WHERE session_id = $1
            ORDER BY created_at DESC
        """, session_id)
        
        return [self._convert_row_to_dict(row) for row in rows]
    
    async def get_message(self, message_id: str) -> dict | None:
        """Get a message by ID."""
        row = await self.db.fetchone("SELECT * FROM messages WHERE id = $1", message_id)
        return self._convert_row_to_dict(row) if row else None

# Global storage instance
postgresql_storage = PostgreSQLStorage()