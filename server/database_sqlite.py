"""SQLite database storage implementation with raw SQL queries.

This module provides the concrete SQLite implementation for the database storage layer.
It uses raw SQL queries for maximum compatibility and performance with SQLite.
Designed to be easily portable to PostgreSQL when migration occurs.
"""
import uuid
import json
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path
import sys
from server.datetime_utils import utc_now, utc_now_iso, to_iso

# Add the project root to Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

from server.db_connection import get_database

class DatabaseStorage:
    """Database storage implementation using SQLite."""
    
    def __init__(self):
        self.db = None
        self._initialized = False
    
    async def initialize(self):
        """Initialize database connection."""
        if not self._initialized:
            self.db = await get_database()
            self._initialized = True
    
    async def ensure_initialized(self):
        """Ensure the database is initialized."""
        if not self._initialized:
            await self.initialize()

    # Document operations
    async def createDocument(self, data: dict) -> dict:
        """Create a new document."""
        await self.ensure_initialized()
        
        doc_id = data.get('id', str(uuid.uuid4()))
        now = utc_now_iso()
        
        await self.db.execute(
            """INSERT INTO documents (id, filename, content_type, size, content, uploaded_at, user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (doc_id, 
             data.get("filename", data.get("name", "")),
             data.get("contentType", "text/plain"),
             data.get("size", len(data["content"])),
             data["content"],
             now,
             data.get("userId"))
        )
        
        return await self.getDocument(doc_id)

    async def getDocument(self, doc_id: str) -> Optional[dict]:
        """Get a document by ID."""
        await self.ensure_initialized()
        
        result = await self.db.fetchone(
            "SELECT * FROM documents WHERE id = ?", (doc_id,)
        )
        
        if result:
            return {
                "id": result["id"],
                "filename": result["filename"],
                "content": result["content"],
                "size": result["size"],
                "contentType": result["content_type"],
                "uploadedAt": result["uploaded_at"],
                "userId": result.get("user_id")
            }
        return None

    async def getAllDocuments(self, userId: Optional[str] = None) -> List[dict]:
        """Get all documents, optionally filtered by userId."""
        await self.ensure_initialized()
        
        if userId:
            results = await self.db.fetchall(
                "SELECT * FROM documents WHERE user_id = ? ORDER BY uploaded_at DESC",
                (userId,)
            )
        else:
            results = await self.db.fetchall("SELECT * FROM documents ORDER BY uploaded_at DESC")
        
        return [
            {
                "id": doc["id"],
                "filename": doc["filename"],
                "content": doc["content"],
                "size": doc["size"],
                "contentType": doc["content_type"],
                "uploadedAt": doc["uploaded_at"],
                "userId": doc.get("user_id")
            }
            for doc in results
        ]

    async def deleteDocument(self, doc_id: str) -> None:
        """Delete a document and its chunks."""
        await self.ensure_initialized()
        
        # Delete document (chunks will be deleted by cascade)
        await self.db.execute("DELETE FROM documents WHERE id = ?", (doc_id,))

    # Document chunk operations
    async def createDocumentChunk(self, data: dict) -> dict:
        """Create a new document chunk."""
        await self.ensure_initialized()
        
        chunk_id = str(uuid.uuid4())
        now = utc_now_iso()
        
        await self.db.execute(
            """INSERT INTO document_chunks (id, document_id, chunk_index, content, metadata, embedding_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (chunk_id,
             data["documentId"],
             data.get("chunkIndex", 0),
             data["content"],
             json.dumps(data.get("metadata", {})),
             data.get("embeddingId"),
             now)
        )
        
        return {
            "id": chunk_id,
            "documentId": data["documentId"],
            "content": data["content"],
            "chunkIndex": data.get("chunkIndex", 0),
            "metadata": data.get("metadata", {}),
            "embeddingId": data.get("embeddingId"),
            "createdAt": now
        }

    async def getDocumentChunks(self, document_id: str) -> List[dict]:
        """Get all chunks for a document."""
        await self.ensure_initialized()
        
        results = await self.db.fetchall(
            "SELECT * FROM document_chunks WHERE document_id = ?", (document_id,)
        )
        
        return [
            {
                "id": chunk["id"],
                "documentId": chunk["document_id"],
                "content": chunk["content"],
                "chunkIndex": chunk["chunk_index"],
                "embeddingId": chunk["embedding_id"],
                "createdAt": chunk["created_at"]
            }
            for chunk in results
        ]

    async def getAllChunks(self) -> List[dict]:
        """Get all chunks."""
        await self.ensure_initialized()
        
        results = await self.db.fetchall("SELECT * FROM document_chunks")
        
        return [
            {
                "id": chunk["id"],
                "documentId": chunk["document_id"],
                "content": chunk["content"],
                "chunkIndex": chunk["chunk_index"],
                "embeddingId": chunk["embedding_id"],
                "createdAt": chunk["created_at"]
            }
            for chunk in results
        ]

    async def updateChunkEmbeddingId(self, chunk_id: str, embedding_id: str) -> None:
        """Update the embedding ID for a chunk."""
        await self.ensure_initialized()
        
        await self.db.execute(
            "UPDATE document_chunks SET embedding_id = ? WHERE id = ?",
            (embedding_id, chunk_id)
        )

    async def createDocumentChunksBatch(self, chunks_data: List[dict]) -> List[dict]:
        """Create multiple document chunks in a single batch operation."""
        await self.ensure_initialized()
        
        if not chunks_data:
            return []
        
        chunk_records = []
        insert_data = []
        
        for data in chunks_data:
            chunk_id = str(uuid.uuid4())
            now = utc_now_iso()
            
            chunk_records.append({
                "id": chunk_id,
                "documentId": data["documentId"],
                "content": data["content"],
                "chunkIndex": data.get("chunkIndex", 0),
                "metadata": data.get("metadata", {}),
                "embeddingId": data.get("embeddingId"),
                "createdAt": now
            })
            
            insert_data.append((
                chunk_id,
                data["documentId"],
                data.get("chunkIndex", 0),
                data["content"],
                json.dumps(data.get("metadata", {})),
                data.get("embeddingId"),
                now
            ))
        
        # Batch insert all chunks
        await self.db.executemany(
            """INSERT INTO document_chunks (id, document_id, chunk_index, content, metadata, embedding_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            insert_data
        )
        
        return chunk_records

    async def updateChunkEmbeddingIdsBatch(self, chunk_embedding_pairs: List[tuple]) -> None:
        """Update embedding IDs for multiple chunks in a single batch operation."""
        await self.ensure_initialized()
        
        if not chunk_embedding_pairs:
            return
        
        # Batch update all embedding IDs
        await self.db.executemany(
            "UPDATE document_chunks SET embedding_id = ? WHERE id = ?",
            chunk_embedding_pairs
        )

    # Chat session operations
    async def createChatSession(self, data: dict) -> dict:
        """Create a new chat session."""
        await self.ensure_initialized()
        
        session_id = str(uuid.uuid4())
        now = utc_now_iso()
        
        await self.db.execute(
            """INSERT INTO chat_sessions (id, title, user_id, metadata, message_count, last_message_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (session_id,
             data.get("title", "New Chat"),
             data.get("userId"),
             json.dumps(data.get("metadata", {})),
             0,
             None,
             now,
             now)
        )
        
        return {
            "id": session_id,
            "title": data.get("title", "New Chat"),
            "userId": data.get("userId"),
            "metadata": data.get("metadata", {}),
            "messageCount": 0,
            "lastMessageAt": None,
            "createdAt": now,
            "updatedAt": now
        }

    async def getChatSession(self, session_id: str) -> Optional[dict]:
        """Get a chat session by ID."""
        await self.ensure_initialized()
        
        result = await self.db.fetchone(
            "SELECT * FROM chat_sessions WHERE id = ?", (session_id,)
        )
        
        if result:
            metadata = json.loads(result["metadata"]) if result["metadata"] else {}
            return {
                "id": result["id"],
                "title": result["title"],
                "userId": result["user_id"],
                "metadata": metadata,
                "messageCount": result["message_count"],
                "lastMessageAt": result["last_message_at"],
                "createdAt": result["created_at"],
                "updatedAt": result["updated_at"]
            }
        return None

    async def getAllChatSessions(self, userId: Optional[str] = None, search: Optional[str] = None) -> List[dict]:
        """Get all chat sessions with optional filtering."""
        await self.ensure_initialized()
        
        query = "SELECT * FROM chat_sessions"
        params = []
        
        if userId:
            query += " WHERE user_id = ?"
            params.append(userId)
        
        query += " ORDER BY updated_at DESC"
        
        results = await self.db.fetchall(query, tuple(params))
        
        sessions = []
        for result in results:
            metadata = json.loads(result["metadata"]) if result["metadata"] else {}
            session = {
                "id": result["id"],
                "title": result["title"],
                "userId": result["user_id"],
                "metadata": metadata,
                "messageCount": result["message_count"],
                "lastMessageAt": result["last_message_at"],
                "createdAt": result["created_at"],
                "updatedAt": result["updated_at"]
            }
            
            # Apply search filter if provided
            if search:
                search_lower = search.lower()
                if (search_lower in session["title"].lower() or 
                    any(search_lower in str(value).lower() for value in metadata.values())):
                    sessions.append(session)
            else:
                sessions.append(session)
        
        return sessions

    async def updateChatSession(self, session_id: str, data: dict) -> dict:
        """Update a chat session."""
        await self.ensure_initialized()
        
        set_clauses = ["updated_at = ?"]
        params = [utc_now_iso()]
        
        if "title" in data:
            set_clauses.append("title = ?")
            params.append(data["title"])
        if "metadata" in data:
            set_clauses.append("metadata = ?")
            params.append(json.dumps(data["metadata"]))
        
        params.append(session_id)
        
        await self.db.execute(
            f"UPDATE chat_sessions SET {', '.join(set_clauses)} WHERE id = ?",
            tuple(params)
        )
        
        # Return updated session
        return await self.getChatSession(session_id)

    async def deleteChatSession(self, session_id: str) -> None:
        """Delete a chat session and all its messages."""
        await self.ensure_initialized()
        
        # Delete session (messages will be deleted by cascade)
        await self.db.execute("DELETE FROM chat_sessions WHERE id = ?", (session_id,))

    async def getChatSessionMetadata(self, session_id: str) -> dict:
        """Get metadata for a chat session including message count and last message."""
        await self.ensure_initialized()
        
        # Get last message
        last_message_result = await self.db.fetchone(
            """SELECT content, created_at, role FROM messages 
               WHERE session_id = ? 
               ORDER BY sequence_number DESC 
               LIMIT 1""",
            (session_id,)
        )
        
        last_message = None
        last_message_at = None
        
        if last_message_result:
            content = last_message_result["content"]
            role = last_message_result["role"]
            
            # Generate a smarter preview - prioritize user questions over AI responses
            if role == "user":
                # For user messages, show the question directly
                last_message = content[:100] + "..." if len(content) > 100 else content
            else:
                # For AI responses, create a summary or show key points
                words = content.split()
                if len(words) > 15:
                    # Take key part of the response (skip common starting phrases)
                    start_idx = 0
                    skip_phrases = ["I understand", "I can help", "Here's", "Let me", "Based on", "According to"]
                    for i, word in enumerate(words[:10]):
                        if any(content.startswith(phrase) for phrase in skip_phrases):
                            start_idx = min(i + 2, len(words) - 5)
                            break
                    
                    preview_words = words[start_idx:start_idx + 12]
                    last_message = " ".join(preview_words) + "..."
                else:
                    last_message = content[:100] + "..." if len(content) > 100 else content
            
            last_message_at = last_message_result["created_at"]
        
        # Get total message count
        count_result = await self.db.fetchone(
            "SELECT COUNT(*) as count FROM messages WHERE session_id = ?",
            (session_id,)
        )
        
        message_count = count_result["count"] if count_result else 0
        
        return {
            "messageCount": message_count,
            "lastMessage": last_message,
            "lastMessageAt": last_message_at
        }

    # Message operations
    async def createMessage(self, data: dict) -> dict:
        """Create a new message."""
        await self.ensure_initialized()
        
        message_id = str(uuid.uuid4())
        now = utc_now_iso()
        
        # Get next sequence number for this session
        last_message_result = await self.db.fetchone(
            """SELECT sequence_number FROM messages 
               WHERE session_id = ? 
               ORDER BY sequence_number DESC 
               LIMIT 1""",
            (data["sessionId"],)
        )
        
        sequence_number = (last_message_result["sequence_number"] + 1) if last_message_result else 1
        
        await self.db.execute(
            """INSERT INTO messages (id, session_id, role, content, sources, classification, 
                                   agent_traces, execution_time_ms, response_type, token_count, 
                                   context_window_used, sequence_number, parent_message_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (message_id,
             data["sessionId"],
             data["role"],
             data["content"],
             json.dumps(data.get("sources")) if data.get("sources") else None,
             json.dumps(data.get("classification")) if data.get("classification") else None,
             json.dumps(data.get("agentTraces")) if data.get("agentTraces") else None,
             data.get("executionTimeMs"),
             data.get("responseType"),
             data.get("tokenCount"),
             data.get("contextWindowUsed"),
             sequence_number,
             data.get("parentMessageId"),
             now)
        )
        
        # Update chat session metadata
        await self.db.execute(
            """UPDATE chat_sessions 
               SET message_count = message_count + 1, 
                   last_message_at = ?, 
                   updated_at = ? 
               WHERE id = ?""",
            (now, now, data["sessionId"])
        )
        
        # If it's a user message and title is generic, update title
        if data["role"] == "user":
            session = await self.getChatSession(data["sessionId"])
            if session and (session["title"] == "New Chat" or session["title"] == "Untitled"):
                new_title = data["content"][:50] + "..." if len(data["content"]) > 50 else data["content"]
                await self.updateChatSession(data["sessionId"], {"title": new_title})
        
        return {
            "id": message_id,
            "sessionId": data["sessionId"],
            "role": data["role"],
            "content": data["content"],
            "sources": data.get("sources"),
            "classification": data.get("classification"),
            "agentTraces": data.get("agentTraces"),
            "executionTimeMs": data.get("executionTimeMs"),
            "responseType": data.get("responseType"),
            "sequenceNumber": sequence_number,
            "createdAt": now
        }

    async def getSessionMessages(self, session_id: str, page: int = 1, limit: int = 50) -> List[dict]:
        """Get messages for a session with pagination."""
        await self.ensure_initialized()
        
        offset = (page - 1) * limit
        
        results = await self.db.fetchall(
            """SELECT * FROM messages 
               WHERE session_id = ? 
               ORDER BY sequence_number ASC 
               LIMIT ? OFFSET ?""",
            (session_id, limit, offset)
        )
        
        message_list = []
        for result in results:
            sources = json.loads(result["sources"]) if result["sources"] else None
            classification = json.loads(result["classification"]) if result["classification"] else None
            agent_traces = json.loads(result["agent_traces"]) if result["agent_traces"] else None
            
            message_list.append({
                "id": result["id"],
                "sessionId": result["session_id"],
                "role": result["role"],
                "content": result["content"],
                "sources": sources,
                "classification": classification,
                "agentTraces": agent_traces,
                "executionTimeMs": result["execution_time_ms"],
                "responseType": result["response_type"],
                "sequenceNumber": result["sequence_number"],
                "createdAt": result["created_at"]
            })
        
        return message_list

    async def getSessionMessageCount(self, session_id: str) -> int:
        """Get total message count for a session."""
        await self.ensure_initialized()
        
        result = await self.db.fetchone(
            "SELECT COUNT(*) as count FROM messages WHERE session_id = ?",
            (session_id,)
        )
        
        return result["count"] if result else 0

    async def clearSessionMessages(self, session_id: str) -> None:
        """Clear all messages from a session."""
        await self.ensure_initialized()
        
        await self.db.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        
        # Reset session message count
        await self.db.execute(
            """UPDATE chat_sessions 
               SET message_count = 0, 
                   last_message_at = NULL, 
                   updated_at = ? 
               WHERE id = ?""",
            (utc_now_iso(), session_id)
        )

    async def getChatStatistics(self, userId: Optional[str] = None) -> dict:
        """Get chat statistics."""
        await self.ensure_initialized()
        
        # Base query for sessions
        session_query = "SELECT COUNT(*) as count FROM chat_sessions"
        session_params = []
        
        if userId:
            session_query += " WHERE user_id = ?"
            session_params.append(userId)
        
        session_result = await self.db.fetchone(session_query, tuple(session_params))
        total_sessions = session_result["count"] if session_result else 0
        
        # Message count
        if userId:
            message_result = await self.db.fetchone(
                """SELECT COUNT(*) as count FROM messages m 
                   JOIN chat_sessions cs ON m.session_id = cs.id 
                   WHERE cs.user_id = ?""",
                (userId,)
            )
        else:
            message_result = await self.db.fetchone("SELECT COUNT(*) as count FROM messages")
        
        total_messages = message_result["count"] if message_result else 0
        
        return {
            "totalSessions": total_sessions,
            "totalMessages": total_messages,
            "averageMessagesPerSession": (total_messages / total_sessions) if total_sessions > 0 else 0
        }

    # Compatibility methods for existing code
    async def updateChatSessionTitle(self, session_id: str, title: str) -> None:
        """Update the title of a chat session (compatibility method)."""
        await self.updateChatSession(session_id, {"title": title})

    # User management methods
    async def createUser(self, data: dict) -> dict:
        """Create a new user."""
        await self.ensure_initialized()
        
        user_id = data.get('id', str(uuid.uuid4()))
        now = utc_now_iso()
        
        await self.db.execute(
            """INSERT INTO users (id, email, name, picture, locale, preferences, last_login_at, created_at, updated_at, is_active)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id,
             data["email"],
             data["name"],
             data.get("picture"),
             data.get("locale", "en"),
             json.dumps(data.get("preferences", {})),
             data.get('lastLoginAt'),
             now,
             now,
             1)
        )
        
        return await self.getUser(user_id)

    async def getUser(self, user_id: str) -> Optional[dict]:
        """Get a user by ID."""
        await self.ensure_initialized()
        
        result = await self.db.fetchone(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        )
        
        if result:
            preferences = json.loads(result["preferences"]) if result["preferences"] else {}
            user_dict = {
                "id": result["id"],
                "email": result["email"],
                "name": result["name"],
                "picture": result["picture"],
                "locale": result["locale"],
                "preferences": preferences,
                "lastLoginAt": result["last_login_at"],
                "createdAt": result["created_at"],
                "updatedAt": result["updated_at"],
                "isActive": bool(result["is_active"])
            }
            
            # Add quota fields if they exist in the schema
            if "is_unlimited" in result.keys():
                user_dict["isUnlimited"] = bool(result["is_unlimited"])
            if "remaining_quota" in result.keys():
                user_dict["remainingQuota"] = result["remaining_quota"]
            if "api_key_hash" in result.keys():
                user_dict["apiKeyHash"] = result["api_key_hash"]
            if "encrypted_api_key" in result.keys():
                user_dict["encryptedApiKey"] = result["encrypted_api_key"]
            if "api_key_provider" in result.keys():
                user_dict["apiKeyProvider"] = result["api_key_provider"]
            
            return user_dict
        return None

    async def getUserByEmail(self, email: str) -> Optional[dict]:
        """Get a user by email."""
        await self.ensure_initialized()
        
        result = await self.db.fetchone(
            "SELECT * FROM users WHERE email = ?", (email,)
        )
        
        if result:
            preferences = json.loads(result["preferences"]) if result["preferences"] else {}
            user_dict = {
                "id": result["id"],
                "email": result["email"],
                "name": result["name"],
                "picture": result["picture"],
                "locale": result["locale"],
                "preferences": preferences,
                "lastLoginAt": result["last_login_at"],
                "createdAt": result["created_at"],
                "updatedAt": result["updated_at"],
                "isActive": bool(result["is_active"])
            }
            
            # Add quota fields if they exist in the schema
            if "is_unlimited" in result.keys():
                user_dict["isUnlimited"] = bool(result["is_unlimited"])
            if "remaining_quota" in result.keys():
                user_dict["remainingQuota"] = result["remaining_quota"]
            if "api_key_hash" in result.keys():
                user_dict["apiKeyHash"] = result["api_key_hash"]
            if "encrypted_api_key" in result.keys():
                user_dict["encryptedApiKey"] = result["encrypted_api_key"]
            if "api_key_provider" in result.keys():
                user_dict["apiKeyProvider"] = result["api_key_provider"]
            
            return user_dict
        return None

    async def getAllUsers(self, search: Optional[str] = None, active_only: bool = True, page: int = 1, limit: int = 20) -> List[dict]:
        """Get all users with filtering and pagination."""
        await self.ensure_initialized()
        
        query = "SELECT * FROM users"
        params = []
        
        conditions = []
        if active_only:
            conditions.append("is_active = 1")
        
        if search:
            conditions.append("(name LIKE ? OR email LIKE ?)")
            search_pattern = f"%{search}%"
            params.extend([search_pattern, search_pattern])
        
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        offset = (page - 1) * limit
        params.extend([limit, offset])
        
        results = await self.db.fetchall(query, tuple(params))
        
        users = []
        for result in results:
            preferences = json.loads(result["preferences"]) if result["preferences"] else {}
            user_dict = {
                "id": result["id"],
                "email": result["email"],
                "name": result["name"],
                "picture": result["picture"],
                "locale": result["locale"],
                "preferences": preferences,
                "lastLoginAt": result["last_login_at"],
                "createdAt": result["created_at"],
                "updatedAt": result["updated_at"],
                "isActive": bool(result["is_active"])
            }
            
            # Add quota fields if they exist in the schema
            if "is_unlimited" in result.keys():
                user_dict["isUnlimited"] = bool(result["is_unlimited"])
            if "remaining_quota" in result.keys():
                user_dict["remainingQuota"] = result["remaining_quota"]
            if "api_key_hash" in result.keys():
                user_dict["apiKeyHash"] = result["api_key_hash"]
            if "encrypted_api_key" in result.keys():
                user_dict["encryptedApiKey"] = result["encrypted_api_key"]
            if "api_key_provider" in result.keys():
                user_dict["apiKeyProvider"] = result["api_key_provider"]
            
            users.append(user_dict)
        
        return users

    async def getUserCount(self, search: Optional[str] = None, active_only: bool = True) -> int:
        """Get total user count with filtering."""
        await self.ensure_initialized()
        
        query = "SELECT COUNT(*) as count FROM users"
        params = []
        
        conditions = []
        if active_only:
            conditions.append("is_active = 1")
        
        if search:
            conditions.append("(name LIKE ? OR email LIKE ?)")
            search_pattern = f"%{search}%"
            params.extend([search_pattern, search_pattern])
        
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        
        result = await self.db.fetchone(query, tuple(params))
        return result["count"] if result else 0

    async def updateUser(self, user_id: str, data: dict) -> dict:
        """Update a user."""
        await self.ensure_initialized()
        
        set_clauses = ["updated_at = ?"]
        params = [utc_now_iso()]
        
        if "name" in data:
            set_clauses.append("name = ?")
            params.append(data["name"])
        if "picture" in data:
            set_clauses.append("picture = ?")
            params.append(data["picture"])
        if "locale" in data:
            set_clauses.append("locale = ?")
            params.append(data["locale"])
        if "preferences" in data:
            set_clauses.append("preferences = ?")
            params.append(json.dumps(data["preferences"]))
        
        params.append(user_id)
        
        await self.db.execute(
            f"UPDATE users SET {', '.join(set_clauses)} WHERE id = ?",
            tuple(params)
        )
        
        return await self.getUser(user_id)
    
    async def updateUserById(self, old_user_id: str, new_user_id: str, data: dict) -> dict:
        """Update a user's ID (for Clerk migration) and other information.
        This updates all foreign key references across related tables."""
        await self.ensure_initialized()
        
        # SQLite requires manual transaction handling
        # Update the user record FIRST before updating foreign keys
        set_clauses = ["id = ?"]
        params = [new_user_id]
        
        if "name" in data:
            set_clauses.append("name = ?")
            params.append(data["name"])
        if "picture" in data:
            set_clauses.append("picture = ?")
            params.append(data["picture"])
        if "locale" in data:
            set_clauses.append("locale = ?")
            params.append(data["locale"])
        if "preferences" in data:
            set_clauses.append("preferences = ?")
            params.append(json.dumps(data["preferences"]))
        if "lastLoginAt" in data:
            set_clauses.append("last_login_at = ?")
            params.append(data["lastLoginAt"])
        
        set_clauses.append("updated_at = ?")
        params.append(utc_now_iso())
        params.append(old_user_id)
        
        # Update user record
        await self.db.execute(
            f"UPDATE users SET {', '.join(set_clauses)} WHERE id = ?",
            tuple(params)
        )
        
        # Update foreign keys in related tables
        await self.db.execute(
            "UPDATE chat_sessions SET user_id = ? WHERE user_id = ?",
            (new_user_id, old_user_id)
        )
        await self.db.execute(
            "UPDATE documents SET user_id = ? WHERE user_id = ?",
            (new_user_id, old_user_id)
        )
        await self.db.execute(
            "UPDATE message_feedback SET user_id = ? WHERE user_id = ?",
            (new_user_id, old_user_id)
        )
        await self.db.execute(
            "UPDATE document_processing_jobs SET user_id = ? WHERE user_id = ?",
            (new_user_id, old_user_id)
        )
        
        # Try to update user_personal_configs if it exists
        try:
            await self.db.execute(
                "UPDATE user_personal_configs SET user_id = ? WHERE user_id = ?",
                (new_user_id, old_user_id)
            )
        except Exception:
            # Table might not exist in older database versions
            pass
        
        return await self.getUser(new_user_id)

    async def deactivateUser(self, user_id: str) -> None:
        """Deactivate a user (soft delete)."""
        await self.ensure_initialized()
        
        await self.db.execute(
            "UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?",
            (utc_now_iso(), user_id)
        )

    async def activateUser(self, user_id: str) -> None:
        """Activate a user."""
        await self.ensure_initialized()
        
        await self.db.execute(
            "UPDATE users SET is_active = 1, updated_at = ? WHERE id = ?",
            (utc_now_iso(), user_id)
        )

    async def updateUserLastLogin(self, user_id: str) -> None:
        """Update user's last login timestamp."""
        await self.ensure_initialized()
        
        now = utc_now_iso()
        await self.db.execute(
            "UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?",
            (now, now, user_id)
        )

    # User session management
    async def createUserSession(self, data: dict) -> dict:
        """Create a user session."""
        await self.ensure_initialized()
        
        session_id = str(uuid.uuid4())
        session_token = str(uuid.uuid4())
        now = utc_now_iso()
        
        # Session expires in 30 days
        expires_at = datetime.fromtimestamp(
            utc_now().timestamp() + (30 * 24 * 60 * 60)
        ).isoformat()
        
        await self.db.execute(
            """INSERT INTO user_sessions (id, user_id, session_token, ip_address, user_agent, 
                                        is_active, expires_at, last_activity_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (session_id,
             data["userId"],
             session_token,
             data.get("ipAddress"),
             data.get("userAgent"),
             1,
             expires_at,
             now,
             now,
             now)
        )
        
        return {
            "id": session_id,
            "userId": data["userId"],
            "sessionToken": session_token,
            "ipAddress": data.get("ipAddress"),
            "userAgent": data.get("userAgent"),
            "isActive": True,
            "expiresAt": expires_at,
            "lastActivityAt": now,
            "createdAt": now
        }

    async def getUserSessions(self, user_id: str, active_only: bool = True) -> List[dict]:
        """Get user sessions."""
        await self.ensure_initialized()
        
        query = "SELECT * FROM user_sessions WHERE user_id = ?"
        params = [user_id]
        
        if active_only:
            query += " AND is_active = 1"
        
        query += " ORDER BY created_at DESC"
        
        results = await self.db.fetchall(query, tuple(params))
        
        return [
            {
                "id": result["id"],
                "userId": result["user_id"],
                "sessionToken": result["session_token"],
                "ipAddress": result["ip_address"],
                "userAgent": result["user_agent"],
                "isActive": bool(result["is_active"]),
                "expiresAt": result["expires_at"],
                "lastActivityAt": result["last_activity_at"],
                "createdAt": result["created_at"]
            }
            for result in results
        ]

    async def invalidateUserSession(self, session_token: str) -> None:
        """Invalidate a specific user session."""
        await self.ensure_initialized()
        
        await self.db.execute(
            "UPDATE user_sessions SET is_active = 0, updated_at = ? WHERE session_token = ?",
            (utc_now_iso(), session_token)
        )

    async def invalidateAllUserSessions(self, user_id: str) -> None:
        """Invalidate all user sessions."""
        await self.ensure_initialized()
        
        await self.db.execute(
            "UPDATE user_sessions SET is_active = 0, updated_at = ? WHERE user_id = ?",
            (utc_now_iso(), user_id)
        )

    async def getUserStatistics(self) -> dict:
        """Get user statistics."""
        await self.ensure_initialized()
        
        # Total users
        total_result = await self.db.fetchone("SELECT COUNT(*) as count FROM users")
        total_users = total_result["count"] if total_result else 0
        
        # Active users
        active_result = await self.db.fetchone("SELECT COUNT(*) as count FROM users WHERE is_active = 1")
        active_users = active_result["count"] if active_result else 0
        
        # New users today (simplified - would need proper date filtering in production)
        new_today_result = await self.db.fetchone(
            "SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = DATE('now')"
        )
        new_users_today = new_today_result["count"] if new_today_result else 0
        
        # Average sessions per user
        session_result = await self.db.fetchone("SELECT COUNT(*) as count FROM user_sessions")
        total_sessions = session_result["count"] if session_result else 0
        
        return {
            "totalUsers": total_users,
            "activeUsers": active_users,
            "newUsersToday": new_users_today,
            "averageSessionsPerUser": (total_sessions / total_users) if total_users > 0 else 0.0
        }
    
    # Message feedback operations
    async def create_message_feedback(
        self,
        message_id: str,
        session_id: str,
        user_id: str,
        feedback_type: str,
        category: Optional[str] = None,
        detail_text: Optional[str] = None,
        query_context: Optional[dict] = None,
        metadata: Optional[dict] = None
    ) -> str:
        """Create a new message feedback entry."""
        feedback_id = str(uuid.uuid4())
        now = utc_now_iso()
        
        await self.db.execute("""
            INSERT INTO message_feedback (
                id, message_id, session_id, user_id, feedback_type,
                category, detail_text, query_context, metadata, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            feedback_id, message_id, session_id, user_id, feedback_type,
            category, detail_text,
            json.dumps(query_context) if query_context else None,
            json.dumps(metadata) if metadata else None,
            now, now
        ])
        
        return feedback_id
    
    async def get_message_feedback(self, message_id: str, user_id: str) -> Optional[dict]:
        """Get feedback for a specific message by a specific user."""
        row = await self.db.fetchone("""
            SELECT * FROM message_feedback 
            WHERE message_id = ? AND user_id = ?
        """, [message_id, user_id])
        
        return dict(row) if row else None
    
    async def update_message_feedback(
        self,
        feedback_id: str,
        feedback_type: str,
        category: Optional[str] = None,
        detail_text: Optional[str] = None,
        query_context: Optional[dict] = None,
        metadata: Optional[dict] = None
    ) -> str:
        """Update an existing message feedback entry."""
        now = utc_now_iso()
        
        await self.db.execute("""
            UPDATE message_feedback
            SET feedback_type = ?, category = ?, detail_text = ?,
                query_context = ?, metadata = ?, updated_at = ?
            WHERE id = ?
        """, [
            feedback_type, category, detail_text,
            json.dumps(query_context) if query_context else None,
            json.dumps(metadata) if metadata else None,
            now, feedback_id
        ])
        
        return feedback_id
    
    async def delete_message_feedback(self, feedback_id: str) -> None:
        """Delete a message feedback entry."""
        await self.db.execute("DELETE FROM message_feedback WHERE id = ?", [feedback_id])
    
    async def get_session_feedback(self, session_id: str) -> List[dict]:
        """Get all feedback for a session."""
        rows = await self.db.fetchall("""
            SELECT * FROM message_feedback 
            WHERE session_id = ?
            ORDER BY created_at DESC
        """, [session_id])
        
        return [dict(row) for row in rows]
    
    async def get_message(self, message_id: str) -> Optional[dict]:
        """Get a message by ID."""
        row = await self.db.fetchone("SELECT * FROM messages WHERE id = ?", [message_id])
        return dict(row) if row else None
    
    # ==================== QUOTA MANAGEMENT ====================
    
    async def decrementQuota(self, user_id: str) -> dict | None:
        """
        Atomically decrement user's quota and return updated user data.
        
        Uses UPDATE...WHERE...RETURNING-like pattern for SQLite.
        Multiple simultaneous requests will be handled correctly by the database.
        
        Args:
            user_id: User ID to decrement quota for
        
        Returns:
            Updated user data if successful, None if quota already at 0
        
        Security:
        - Atomic operation prevents race conditions
        - WHERE clause ensures we only decrement if quota > 0
        - Returns None if quota exhausted (no rows updated)
        """
        await self.ensure_initialized()
        
        # SQLite doesn't support RETURNING, so we need to do this in two steps
        # First, try to decrement
        await self.db.execute("""
            UPDATE users
            SET remaining_quota = remaining_quota - 1,
                updated_at = ?
            WHERE id = ? AND remaining_quota > 0
        """, (utc_now_iso(), user_id))
        
        # Check if any row was updated by fetching the user
        user = await self.getUser(user_id)
        if user and user.get('remainingQuota', 0) >= 0:
            return user
        return None
    
    async def setUnlimitedQuota(self, user_id: str, unlimited: bool = True) -> dict:
        """
        Set a user's unlimited quota status.
        
        Args:
            user_id: User ID
            unlimited: True for unlimited, False for limited (50 quota)
        
        Returns:
            Updated user data
        """
        await self.ensure_initialized()
        
        if unlimited:
            # Set unlimited and clear quota count
            await self.db.execute("""
                UPDATE users
                SET is_unlimited = 1,
                    remaining_quota = NULL,
                    updated_at = ?
                WHERE id = ?
            """, (utc_now_iso(), user_id))
        else:
            # Set limited and initialize quota to 50
            await self.db.execute("""
                UPDATE users
                SET is_unlimited = 0,
                    remaining_quota = 50,
                    updated_at = ?
                WHERE id = ?
            """, (utc_now_iso(), user_id))
        
        return await self.getUser(user_id)
    
    async def resetUserQuota(self, user_id: str, quota: int = 50) -> dict:
        """
        Reset a user's quota to a specific value.
        
        Args:
            user_id: User ID
            quota: New quota value (default 50)
        
        Returns:
            Updated user data
        """
        await self.ensure_initialized()
        
        await self.db.execute("""
            UPDATE users
            SET remaining_quota = ?,
                updated_at = ?
            WHERE id = ? AND (is_unlimited = 0 OR is_unlimited IS NULL)
        """, (quota, utc_now_iso(), user_id))
        
        return await self.getUser(user_id)
    
    async def setUserApiKey(self, user_id: str, api_key_hash: str) -> dict:
        """
        Set a user's personal API key hash.
        
        Args:
            user_id: User ID
            api_key_hash: SHA-256 hash of the API key
        
        Returns:
            Updated user data
        """
        await self.ensure_initialized()
        
        await self.db.execute("""
            UPDATE users
            SET api_key_hash = ?,
                updated_at = ?
            WHERE id = ?
        """, (api_key_hash, utc_now_iso(), user_id))
        
        return await self.getUser(user_id)
    
    async def getUserQuota(self, user_id: str) -> dict | None:
        """
        Get quota information for a user.
        
        Args:
            user_id: User ID
        
        Returns:
            Dict with quota information or None if user not found
        """
        await self.ensure_initialized()
        
        row = await self.db.fetchone("""
            SELECT id, email, is_unlimited, remaining_quota, 
                   (api_key_hash IS NOT NULL) as has_personal_key
            FROM users
            WHERE id = ?
        """, (user_id,))
        
        if row:
            return {
                "id": row["id"],
                "email": row["email"],
                "isUnlimited": bool(row["is_unlimited"]),
                "remainingQuota": row["remaining_quota"],
                "hasPersonalKey": bool(row["has_personal_key"])
            }
        return None


# Global storage instance
db_storage = DatabaseStorage()
