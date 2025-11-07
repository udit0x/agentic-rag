"""Database-agnostic storage interface with backend abstraction.

This module provides the main database interface that abstracts between different
database implementations (SQLite, PostgreSQL) and technologies (raw SQL, Drizzle ORM).
"""
import uuid
import json
import subprocess
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path
import sys
import os

class DatabaseStorage:
    """Database storage implementation that bridges to TypeScript/Drizzle ORM for database portability."""
    
    def __init__(self):
        self.db_type = os.getenv('DB_TYPE', 'sqlite')
        self.ts_bridge_path = Path(__file__).parent / "db-storage.ts"
        self._initialized = False
        self._storage_backend = None
    
    async def initialize(self):
        """Initialize database connection based on DB_TYPE."""
        if not self._initialized:
            # Determine which backend to use
            if self.db_type == 'postgresql':
                try:
                    from server.database_postgresql import postgresql_storage
                    self._storage_backend = postgresql_storage
                    await self._storage_backend.initialize()
                    print(f"[Database] Using PostgreSQL backend")
                except ImportError as e:
                    print(f"[Database] PostgreSQL backend not available: {e}")
                    print("[Database] Falling back to SQLite backend")
                    await self._initialize_sqlite_fallback()
                except Exception as e:
                    print(f"[Database] PostgreSQL connection failed: {e}")
                    print("[Database] Falling back to SQLite backend")
                    await self._initialize_sqlite_fallback()
            else:
                await self._initialize_sqlite_fallback()
            
            self._initialized = True
    
    async def _initialize_sqlite_fallback(self):
        """Initialize SQLite fallback backend."""
        from server.database_sqlite import db_storage
        self._storage_backend = db_storage
        await self._storage_backend.initialize()
        print(f"[Database] Using SQLite backend")
    
    async def ensure_initialized(self):
        """Ensure the database is initialized."""
        if not self._initialized:
            await self.initialize()
    
    async def _delegate_operation(self, operation: str, *args, **kwargs):
        """Delegate operation to the appropriate backend."""
        await self.ensure_initialized()
        
        if hasattr(self._storage_backend, operation):
            method = getattr(self._storage_backend, operation)
            return await method(*args, **kwargs)
        else:
            raise Exception(f"Operation '{operation}' not supported by current backend")

    # Public API methods that delegate to the appropriate backend
    
    # Document operations
    async def createDocument(self, data: dict) -> dict:
        """Create a new document."""
        return await self._delegate_operation('createDocument', data)

    async def getDocument(self, doc_id: str) -> Optional[dict]:
        """Get a document by ID."""
        return await self._delegate_operation('getDocument', doc_id)

    async def getAllDocuments(self) -> List[dict]:
        """Get all documents."""
        return await self._delegate_operation('getAllDocuments')

    async def deleteDocument(self, doc_id: str) -> None:
        """Delete a document and its chunks."""
        await self._delegate_operation('deleteDocument', doc_id)

    # Document chunk operations
    async def createDocumentChunk(self, data: dict) -> dict:
        """Create a new document chunk."""
        return await self._delegate_operation('createDocumentChunk', data)

    async def getDocumentChunks(self, document_id: str) -> List[dict]:
        """Get all chunks for a document."""
        return await self._delegate_operation('getDocumentChunks', document_id)

    async def getAllChunks(self) -> List[dict]:
        """Get all chunks."""
        return await self._delegate_operation('getAllChunks')

    async def updateChunkEmbeddingId(self, chunk_id: str, embedding_id: str) -> None:
        """Update the embedding ID for a chunk."""
        await self._delegate_operation('updateChunkEmbeddingId', chunk_id, embedding_id)

    async def createDocumentChunksBatch(self, chunks_data: List[dict]) -> List[dict]:
        """Create multiple document chunks in a single batch operation."""
        return await self._delegate_operation('createDocumentChunksBatch', chunks_data)

    async def updateChunkEmbeddingIdsBatch(self, chunk_embedding_pairs: List[tuple]) -> None:
        """Update embedding IDs for multiple chunks in a single batch operation."""
        await self._delegate_operation('updateChunkEmbeddingIdsBatch', chunk_embedding_pairs)

    # Chat session operations
    async def createChatSession(self, data: dict) -> dict:
        """Create a new chat session."""
        return await self._delegate_operation('createChatSession', data)

    async def getChatSession(self, session_id: str) -> Optional[dict]:
        """Get a chat session by ID."""
        return await self._delegate_operation('getChatSession', session_id)

    async def getAllChatSessions(self, userId: Optional[str] = None, search: Optional[str] = None) -> List[dict]:
        """Get all chat sessions with optional filtering."""
        return await self._delegate_operation('getAllChatSessions', userId, search)

    async def updateChatSession(self, session_id: str, data: dict) -> dict:
        """Update a chat session."""
        return await self._delegate_operation('updateChatSession', session_id, data)

    async def deleteChatSession(self, session_id: str) -> None:
        """Delete a chat session and all its messages."""
        await self._delegate_operation('deleteChatSession', session_id)

    async def getChatSessionMetadata(self, session_id: str) -> dict:
        """Get metadata for a chat session including message count and last message."""
        return await self._delegate_operation('getChatSessionMetadata', session_id)

    # Message operations
    async def createMessage(self, data: dict) -> dict:
        """Create a new message."""
        return await self._delegate_operation('createMessage', data)

    async def getSessionMessages(self, session_id: str, page: int = 1, limit: int = 50) -> List[dict]:
        """Get messages for a session with pagination."""
        return await self._delegate_operation('getSessionMessages', session_id, page, limit)

    async def getSessionMessageCount(self, session_id: str) -> int:
        """Get total message count for a session."""
        return await self._delegate_operation('getSessionMessageCount', session_id)

    async def clearSessionMessages(self, session_id: str) -> None:
        """Clear all messages from a session."""
        await self._delegate_operation('clearSessionMessages', session_id)

    async def getChatStatistics(self, userId: Optional[str] = None) -> dict:
        """Get chat statistics."""
        return await self._delegate_operation('getChatStatistics', userId)

    # Compatibility methods for existing code
    async def updateChatSessionTitle(self, session_id: str, title: str) -> None:
        """Update the title of a chat session (compatibility method)."""
        await self.updateChatSession(session_id, {"title": title})


# Global storage instance
db_storage = DatabaseStorage()