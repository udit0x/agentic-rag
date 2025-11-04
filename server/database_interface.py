"""Database-agnostic storage interface with backend abstraction.

This module provides the main database interface that abstracts between different
database implementations (SQLite, PostgreSQL) and technologies (raw SQL, Drizzle ORM).
Currently falls back to SQLite implementation when TypeScript bridge is unavailable.
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
        self.ts_bridge_path = Path(__file__).parent / "db-storage.ts"
        self._initialized = False
        self._fallback_storage = None
    
    async def initialize(self):
        """Initialize database connection."""
        if not self._initialized:
            # Try to compile TypeScript bridge if it exists
            try:
                if self.ts_bridge_path.exists():
                    # Compile the TypeScript file
                    subprocess.run(
                        ["npx", "tsx", "--check", str(self.ts_bridge_path)],
                        cwd=str(Path(__file__).parent.parent),
                        capture_output=True
                    )
            except Exception:
                pass  # Continue with fallback
            
            self._initialized = True
    
    async def ensure_initialized(self):
        """Ensure the database is initialized."""
        if not self._initialized:
            await self.initialize()
    
    async def _execute_ts_operation(self, operation: str, data: dict = None) -> dict:
        """Execute operation through TypeScript bridge for database portability."""
        try:
            cmd_data = {
                "operation": operation,
                "data": data or {}
            }
            
            # Try to use the TypeScript bridge
            result = subprocess.run(
                ["npx", "tsx", str(self.ts_bridge_path)],
                input=json.dumps(cmd_data),
                capture_output=True,
                text=True,
                cwd=str(Path(__file__).parent.parent)
            )
            
            if result.returncode == 0:
                return json.loads(result.stdout)
            else:
                raise Exception(f"TypeScript bridge failed: {result.stderr}")
                
        except Exception as e:
            # Silently fallback to Python SQLite implementation
            # print(f"TypeScript bridge unavailable, using fallback: {e}")
            return await self._execute_fallback_operation(operation, data)
    
    async def _execute_fallback_operation(self, operation: str, data: dict = None) -> dict:
        """Fallback to Python SQLite implementation."""
        if self._fallback_storage is None:
            from server.database_sqlite import db_storage
            self._fallback_storage = db_storage
            await self._fallback_storage.initialize()
        
        # Map operations to fallback storage methods
        operation_map = {
            "createChatSession": self._fallback_storage.createChatSession,
            "getChatSession": lambda d: self._fallback_storage.getChatSession(d["sessionId"]),
            "getAllChatSessions": lambda d: self._fallback_storage.getAllChatSessions(
                d.get("userId"), d.get("search")
            ),
            "updateChatSession": lambda d: self._fallback_storage.updateChatSession(
                d["sessionId"], d["updateData"]
            ),
            "deleteChatSession": lambda d: self._fallback_storage.deleteChatSession(d["sessionId"]),
            "getChatSessionMetadata": lambda d: self._fallback_storage.getChatSessionMetadata(d["sessionId"]),
            "createMessage": self._fallback_storage.createMessage,
            "getSessionMessages": lambda d: self._fallback_storage.getSessionMessages(
                d["sessionId"], d.get("page", 1), d.get("limit", 50)
            ),
            "getSessionMessageCount": lambda d: self._fallback_storage.getSessionMessageCount(d["sessionId"]),
            "clearSessionMessages": lambda d: self._fallback_storage.clearSessionMessages(d["sessionId"]),
            "getChatStatistics": lambda d: self._fallback_storage.getChatStatistics(d.get("userId")),
            
            # Document operations
            "createDocument": self._fallback_storage.createDocument,
            "getDocument": lambda d: self._fallback_storage.getDocument(d["docId"]),
            "getAllDocuments": lambda d: self._fallback_storage.getAllDocuments(),
            "deleteDocument": lambda d: self._fallback_storage.deleteDocument(d["docId"]),
            
            # Document chunk operations
            "createDocumentChunk": self._fallback_storage.createDocumentChunk,
            "getDocumentChunks": lambda d: self._fallback_storage.getDocumentChunks(d["documentId"]),
            "getAllChunks": lambda d: self._fallback_storage.getAllChunks(),
            "updateChunkEmbeddingId": lambda d: self._fallback_storage.updateChunkEmbeddingId(
                d["chunkId"], d["embeddingId"]
            ),
        }
        
        if operation in operation_map:
            return await operation_map[operation](data or {})
        else:
            raise Exception(f"Unknown operation: {operation}")

    # Public API methods that delegate to the appropriate backend
    
    # Document operations
    async def createDocument(self, data: dict) -> dict:
        """Create a new document."""
        await self.ensure_initialized()
        return await self._execute_ts_operation("createDocument", data)

    async def getDocument(self, doc_id: str) -> Optional[dict]:
        """Get a document by ID."""
        await self.ensure_initialized()
        return await self._execute_ts_operation("getDocument", {"docId": doc_id})

    async def getAllDocuments(self) -> List[dict]:
        """Get all documents."""
        await self.ensure_initialized()
        return await self._execute_ts_operation("getAllDocuments")

    async def deleteDocument(self, doc_id: str) -> None:
        """Delete a document and its chunks."""
        await self.ensure_initialized()
        await self._execute_ts_operation("deleteDocument", {"docId": doc_id})

    # Document chunk operations
    async def createDocumentChunk(self, data: dict) -> dict:
        """Create a new document chunk."""
        await self.ensure_initialized()
        return await self._execute_ts_operation("createDocumentChunk", data)

    async def getDocumentChunks(self, document_id: str) -> List[dict]:
        """Get all chunks for a document."""
        await self.ensure_initialized()
        return await self._execute_ts_operation("getDocumentChunks", {"documentId": document_id})

    async def getAllChunks(self) -> List[dict]:
        """Get all chunks."""
        await self.ensure_initialized()
        return await self._execute_ts_operation("getAllChunks")

    async def updateChunkEmbeddingId(self, chunk_id: str, embedding_id: str) -> None:
        """Update the embedding ID for a chunk."""
        await self.ensure_initialized()
        await self._execute_ts_operation("updateChunkEmbeddingId", {
            "chunkId": chunk_id,
            "embeddingId": embedding_id
        })

    # Chat session operations
    async def createChatSession(self, data: dict) -> dict:
        """Create a new chat session."""
        await self.ensure_initialized()
        return await self._execute_ts_operation("createChatSession", data)

    async def getChatSession(self, session_id: str) -> Optional[dict]:
        """Get a chat session by ID."""
        await self.ensure_initialized()
        return await self._execute_ts_operation("getChatSession", {"sessionId": session_id})

    async def getAllChatSessions(self, userId: Optional[str] = None, search: Optional[str] = None) -> List[dict]:
        """Get all chat sessions with optional filtering."""
        await self.ensure_initialized()
        return await self._execute_ts_operation("getAllChatSessions", {
            "userId": userId,
            "search": search
        })

    async def updateChatSession(self, session_id: str, data: dict) -> dict:
        """Update a chat session."""
        await self.ensure_initialized()
        return await self._execute_ts_operation("updateChatSession", {
            "sessionId": session_id,
            "updateData": data
        })

    async def deleteChatSession(self, session_id: str) -> None:
        """Delete a chat session and all its messages."""
        await self.ensure_initialized()
        await self._execute_ts_operation("deleteChatSession", {"sessionId": session_id})

    async def getChatSessionMetadata(self, session_id: str) -> dict:
        """Get metadata for a chat session including message count and last message."""
        await self.ensure_initialized()
        return await self._execute_ts_operation("getChatSessionMetadata", {"sessionId": session_id})

    # Message operations
    async def createMessage(self, data: dict) -> dict:
        """Create a new message."""
        await self.ensure_initialized()
        return await self._execute_ts_operation("createMessage", data)

    async def getSessionMessages(self, session_id: str, page: int = 1, limit: int = 50) -> List[dict]:
        """Get messages for a session with pagination."""
        await self.ensure_initialized()
        return await self._execute_ts_operation("getSessionMessages", {
            "sessionId": session_id,
            "page": page,
            "limit": limit
        })

    async def getSessionMessageCount(self, session_id: str) -> int:
        """Get total message count for a session."""
        await self.ensure_initialized()
        return await self._execute_ts_operation("getSessionMessageCount", {"sessionId": session_id})

    async def clearSessionMessages(self, session_id: str) -> None:
        """Clear all messages from a session."""
        await self.ensure_initialized()
        await self._execute_ts_operation("clearSessionMessages", {"sessionId": session_id})

    async def getChatStatistics(self, userId: Optional[str] = None) -> dict:
        """Get chat statistics."""
        await self.ensure_initialized()
        return await self._execute_ts_operation("getChatStatistics", {"userId": userId})

    # Compatibility methods for existing code
    async def updateChatSessionTitle(self, session_id: str, title: str) -> None:
        """Update the title of a chat session (compatibility method)."""
        await self.updateChatSession(session_id, {"title": title})


# Global storage instance
db_storage = DatabaseStorage()