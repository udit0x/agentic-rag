"""In-memory storage implementation for the RAG system."""
import uuid
from datetime import datetime
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from server.datetime_utils import utc_now


@dataclass
class Document:
    id: str
    name: str
    content: str
    uploadedAt: datetime


@dataclass
class DocumentChunk:
    id: str
    documentId: str
    content: str
    chunkIndex: int = 0
    embeddingId: Optional[str] = None
    createdAt: datetime = field(default_factory=utc_now)


@dataclass
class ChatSession:
    id: str
    title: str
    createdAt: datetime
    updatedAt: datetime


@dataclass
class Message:
    id: str
    sessionId: str
    role: str  # 'user' or 'assistant'
    content: str
    createdAt: datetime
    sources: Optional[List[Dict]] = None


class MemStorage:
    """In-memory storage implementation."""
    
    def __init__(self):
        self.documents: Dict[str, Document] = {}
        self.document_chunks: Dict[str, DocumentChunk] = {}
        self.chat_sessions: Dict[str, ChatSession] = {}
        self.messages: Dict[str, Message] = {}

    # Document operations
    async def createDocument(self, data: dict) -> dict:
        """Create a new document."""
        doc_id = str(uuid.uuid4())
        document = Document(
            id=doc_id,
            name=data.get("filename", data.get("name", "")),
            content=data["content"],
            uploadedAt=utc_now()
        )
        self.documents[doc_id] = document
        return {
            "id": document.id,
            "filename": document.name,
            "content": document.content,
            "size": data.get("size", len(document.content)),
            "uploadedAt": document.uploadedAt,
            "contentType": data.get("contentType", "text/plain")
        }

    async def getDocument(self, doc_id: str) -> Optional[dict]:
        """Get a document by ID."""
        document = self.documents.get(doc_id)
        if document:
            return {
                "id": document.id,
                "filename": document.name,
                "content": document.content,
                "size": len(document.content),
                "uploadedAt": document.uploadedAt
            }
        return None

    async def getAllDocuments(self) -> List[dict]:
        """Get all documents."""
        return [
            {
                "id": doc.id,
                "filename": doc.name,
                "content": doc.content,
                "size": len(doc.content),
                "uploadedAt": doc.uploadedAt
            }
            for doc in self.documents.values()
        ]

    async def deleteDocument(self, doc_id: str) -> None:
        """Delete a document and its chunks."""
        if doc_id in self.documents:
            del self.documents[doc_id]
        
        # Delete associated chunks
        chunks_to_delete = [
            chunk_id for chunk_id, chunk in self.document_chunks.items()
            if chunk.documentId == doc_id
        ]
        for chunk_id in chunks_to_delete:
            del self.document_chunks[chunk_id]

    # Document chunk operations
    async def createDocumentChunk(self, data: dict) -> dict:
        """Create a new document chunk."""
        chunk_id = str(uuid.uuid4())
        chunk = DocumentChunk(
            id=chunk_id,
            documentId=data["documentId"],
            content=data["content"],
            chunkIndex=data.get("chunkIndex", 0),
            embeddingId=data.get("embeddingId"),
            createdAt=utc_now()
        )
        self.document_chunks[chunk_id] = chunk
        return {
            "id": chunk.id,
            "documentId": chunk.documentId,
            "content": chunk.content,
            "chunkIndex": data.get("chunkIndex", 0),
            "metadata": data.get("metadata", {}),
            "embeddingId": chunk.embeddingId,
            "createdAt": chunk.createdAt
        }

    async def getDocumentChunks(self, document_id: str) -> List[DocumentChunk]:
        """Get all chunks for a document."""
        return [
            chunk for chunk in self.document_chunks.values()
            if chunk.documentId == document_id
        ]

    async def getAllChunks(self) -> List[DocumentChunk]:
        """Get all chunks."""
        return list(self.document_chunks.values())

    async def getAllChunks(self) -> List[dict]:
        """Get all chunks."""
        return [
            {
                "id": chunk.id,
                "documentId": chunk.documentId,
                "content": chunk.content,
                "chunkIndex": chunk.chunkIndex,
                "embeddingId": chunk.embeddingId,
                "createdAt": chunk.createdAt
            }
            for chunk in self.document_chunks.values()
        ]

    async def updateChunkEmbeddingId(self, chunk_id: str, embedding_id: str) -> None:
        """Update the embedding ID for a chunk."""
        if chunk_id in self.document_chunks:
            self.document_chunks[chunk_id].embeddingId = embedding_id

    # Chat session operations
    async def createChatSession(self, data: dict) -> dict:
        """Create a new chat session."""
        session_id = str(uuid.uuid4())
        now = utc_now()
        session = ChatSession(
            id=session_id,
            title=data.get("title", "New Chat"),
            createdAt=now,
            updatedAt=now
        )
        self.chat_sessions[session_id] = session
        return {
            "id": session.id,
            "title": session.title,
            "createdAt": session.createdAt,
            "updatedAt": session.updatedAt
        }

    async def getChatSession(self, session_id: str) -> Optional[dict]:
        """Get a chat session by ID."""
        session = self.chat_sessions.get(session_id)
        if session:
            return {
                "id": session.id,
                "title": session.title,
                "createdAt": session.createdAt,
                "updatedAt": session.updatedAt
            }
        return None

    async def updateChatSessionTitle(self, session_id: str, title: str) -> None:
        """Update the title of a chat session."""
        if session_id in self.chat_sessions:
            session = self.chat_sessions[session_id]
            session.title = title
            session.updatedAt = utc_now()

    # Message operations
    async def createMessage(self, data: dict) -> dict:
        """Create a new message."""
        message_id = str(uuid.uuid4())
        message = Message(
            id=message_id,
            sessionId=data["sessionId"],
            role=data["role"],
            content=data["content"],
            createdAt=utc_now(),
            sources=data.get("sources")
        )
        self.messages[message_id] = message

        # Update session's updatedAt timestamp
        if data["sessionId"] in self.chat_sessions:
            self.chat_sessions[data["sessionId"]].updatedAt = utc_now()

        return {
            "id": message.id,
            "sessionId": message.sessionId,
            "role": message.role,
            "content": message.content,
            "sources": message.sources,
            "createdAt": message.createdAt
        }

    async def getSessionMessages(self, session_id: str) -> List[dict]:
        """Get all messages for a session, sorted by creation time."""
        messages = [
            msg for msg in self.messages.values()
            if msg.sessionId == session_id
        ]
        sorted_messages = sorted(messages, key=lambda x: x.createdAt)
        return [
            {
                "id": msg.id,
                "sessionId": msg.sessionId,
                "role": msg.role,
                "content": msg.content,
                "sources": msg.sources,
                "createdAt": msg.createdAt
            }
            for msg in sorted_messages
        ]


# Global storage instance - Use database-agnostic interface
from server.database_interface import db_storage as storage
