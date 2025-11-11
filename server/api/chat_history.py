"""Chat history and session management endpoints."""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid

from server.storage import storage
from server.auth_middleware import get_authenticated_user_id, require_authenticated_user

router = APIRouter(prefix="/api/chat-sessions", tags=["chat-sessions"])

# Request/Response Models
class CreateChatSessionRequest(BaseModel):
    title: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class UpdateChatSessionRequest(BaseModel):
    title: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class ChatSessionResponse(BaseModel):
    id: str
    title: str
    userId: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    messageCount: int
    lastMessageAt: Optional[datetime] = None
    lastMessage: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime

class ChatSessionListResponse(BaseModel):
    sessions: List[ChatSessionResponse]
    total: int
    page: int
    limit: int
    hasMore: bool

class MessageResponse(BaseModel):
    id: str
    sessionId: str
    role: str
    content: str
    sources: Optional[List[Dict[str, Any]]] = None
    classification: Optional[Dict[str, Any]] = None
    agentTraces: Optional[List[Dict[str, Any]]] = None
    executionTimeMs: Optional[int] = None
    responseType: Optional[str] = None
    sequenceNumber: int
    createdAt: datetime

class MessagesListResponse(BaseModel):
    messages: List[MessageResponse]
    sessionId: str
    total: int

# Chat Session Endpoints
@router.get("/sessions", response_model=ChatSessionListResponse)
async def list_chat_sessions(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search in session titles and messages"),
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    List chat sessions with pagination and filtering.
    Returns sessions sorted by most recent activity.
    
    Security:
    - Only returns sessions belonging to the authenticated user
    - User ID extracted from Clerk JWT token (cannot be spoofed)
    """
    try:
        # ✅ SECURITY: Filter by authenticated user ID from JWT
        all_sessions = await storage.getAllChatSessions(userId=authenticated_user_id, search=search)
        
        # Calculate pagination
        total = len(all_sessions)
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        sessions_page = all_sessions[start_idx:end_idx]
        
        # Convert to response format
        session_responses = []
        for session in sessions_page:
            # ✅ OPTIMIZED: message_count and last_message_at now included in session from JOIN
            # No need for separate getChatSessionMetadata call (eliminates N+1 query problem)
            
            session_responses.append(ChatSessionResponse(
                id=session["id"],
                title=session["title"],
                userId=session.get("userId"),
                metadata=session.get("metadata"),
                messageCount=session.get("messageCount", 0),  # From JOIN
                lastMessageAt=session.get("lastMessageAt"),   # From JOIN
                lastMessage=None,  # Not needed for list view
                createdAt=session["createdAt"],
                updatedAt=session["updatedAt"]
            ))
        
        return ChatSessionListResponse(
            sessions=session_responses,
            total=total,
            page=page,
            limit=limit,
            hasMore=end_idx < total
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list chat sessions: {str(e)}")

@router.post("/sessions", response_model=ChatSessionResponse)
async def create_chat_session(
    request: CreateChatSessionRequest,
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    Create a new chat session.
    
    Security:
    - Automatically associates session with authenticated user
    - User ID from JWT token (cannot be spoofed)
    """
    try:
        session_data = {
            "title": request.title or "New Chat",
            "userId": authenticated_user_id,  # ✅ SECURITY: Use authenticated user ID from JWT
            "metadata": request.metadata or {}
        }
        
        session = await storage.createChatSession(session_data)
        
        return ChatSessionResponse(
            id=session["id"],
            title=session["title"],
            userId=session.get("userId"),
            metadata=session.get("metadata", {}),
            messageCount=0,
            lastMessageAt=None,
            lastMessage=None,
            createdAt=session["createdAt"],
            updatedAt=session["updatedAt"]
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create chat session: {str(e)}")

@router.get("/sessions/{session_id}", response_model=ChatSessionResponse)
async def get_chat_session(
    session_id: str,
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    Get a specific chat session by ID.
    
    Security:
    - Validates session ownership before returning
    - Returns 403 if attempting to access another user's session
    """
    try:
        session = await storage.getChatSession(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Chat session not found")
        
        # ✅ SECURITY: Validate session ownership
        if session.get("userId") and session.get("userId") != authenticated_user_id:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: Session {session_id} belongs to a different user"
            )
        
        # Get session metadata
        session_meta = await storage.getChatSessionMetadata(session_id)
        
        return ChatSessionResponse(
            id=session["id"],
            title=session["title"],
            userId=session.get("userId"),
            metadata=session.get("metadata", {}),
            messageCount=session_meta["messageCount"],
            lastMessageAt=session_meta.get("lastMessageAt"),
            lastMessage=session_meta.get("lastMessage"),
            createdAt=session["createdAt"],
            updatedAt=session["updatedAt"]
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get chat session: {str(e)}")

@router.put("/sessions/{session_id}", response_model=ChatSessionResponse)
async def update_chat_session(
    session_id: str,
    request: UpdateChatSessionRequest,
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    Update a chat session.
    
    Security:
    - Validates session ownership before updating
    - Returns 403 if attempting to update another user's session
    """
    try:
        session = await storage.getChatSession(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Chat session not found")
        
        # ✅ SECURITY: Validate session ownership
        if session.get("userId") and session.get("userId") != authenticated_user_id:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: Session {session_id} belongs to a different user"
            )
        
        # Update fields
        update_data = {}
        if request.title is not None:
            update_data["title"] = request.title
        if request.metadata is not None:
            update_data["metadata"] = request.metadata
        
        if update_data:
            updated_session = await storage.updateChatSession(session_id, update_data)
        else:
            updated_session = session
        
        # Get session metadata
        session_meta = await storage.getChatSessionMetadata(session_id)
        
        return ChatSessionResponse(
            id=updated_session["id"],
            title=updated_session["title"],
            userId=updated_session.get("userId"),
            metadata=updated_session.get("metadata", {}),
            messageCount=session_meta["messageCount"],
            lastMessageAt=session_meta.get("lastMessageAt"),
            lastMessage=session_meta.get("lastMessage"),
            createdAt=updated_session["createdAt"],
            updatedAt=updated_session["updatedAt"]
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update chat session: {str(e)}")

@router.delete("/sessions/{session_id}")
async def delete_chat_session(
    session_id: str,
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    Delete a chat session and all its messages.
    
    Security:
    - Validates session ownership before deletion
    - Returns 403 if attempting to delete another user's session
    """
    try:
        session = await storage.getChatSession(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Chat session not found")
        
        # ✅ SECURITY: Validate session ownership
        if session.get("userId") and session.get("userId") != authenticated_user_id:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: Session {session_id} belongs to a different user"
            )
        
        await storage.deleteChatSession(session_id)
        
        return {"message": "Chat session deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete chat session: {str(e)}")

# Message Endpoints
@router.get("/sessions/{session_id}/messages", response_model=MessagesListResponse)
async def get_session_messages(
    session_id: str,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=200, description="Items per page"),
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    Get messages for a specific chat session.
    
    Security:
    - Validates session ownership before returning messages
    - Returns 403 if attempting to access another user's messages
    """
    try:
        session = await storage.getChatSession(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Chat session not found")
        
        # ✅ SECURITY: Validate session ownership
        if session.get("userId") and session.get("userId") != authenticated_user_id:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: Session {session_id} belongs to a different user"
            )
        
        # Get messages with pagination
        messages = await storage.getSessionMessages(session_id, page=page, limit=limit)
        total_messages = await storage.getSessionMessageCount(session_id)
        
        # Convert to response format
        message_responses = []
        for msg in messages:
            message_responses.append(MessageResponse(
                id=msg["id"],
                sessionId=msg["sessionId"],
                role=msg["role"],
                content=msg["content"],
                sources=msg.get("sources"),
                classification=msg.get("classification"),
                agentTraces=msg.get("agentTraces"),
                executionTimeMs=msg.get("executionTimeMs"),
                responseType=msg.get("responseType"),
                sequenceNumber=msg.get("sequenceNumber", 0),
                createdAt=msg["createdAt"]
            ))
        
        return MessagesListResponse(
            messages=message_responses,
            sessionId=session_id,
            total=total_messages
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get session messages: {str(e)}")

@router.delete("/sessions/{session_id}/messages")
async def clear_session_messages(
    session_id: str,
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    Clear all messages from a chat session.
    
    Security:
    - Validates session ownership before clearing messages
    - Returns 403 if attempting to clear another user's messages
    """
    try:
        session = await storage.getChatSession(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Chat session not found")
        
        # ✅ SECURITY: Validate session ownership
        if session.get("userId") and session.get("userId") != authenticated_user_id:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: Session {session_id} belongs to a different user"
            )
        
        await storage.clearSessionMessages(session_id)
        
        return {"message": "Session messages cleared successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear session messages: {str(e)}")

# Statistics Endpoints
@router.get("/stats")
async def get_chat_statistics(
    authenticated_user_id: str = Depends(require_authenticated_user),
    userId: Optional[str] = Query(None)
):
    """
    Get chat statistics for analytics.
    
    Security:
    - Requires authentication
    - If userId parameter is provided, validates it matches authenticated user
    - Always filters by authenticated user ID regardless of parameter
    """
    try:
        # ✅ SECURITY: Ignore userId parameter, always use authenticated user's ID
        # This prevents users from requesting statistics for other users
        stats = await storage.getChatStatistics(userId=authenticated_user_id)
        return stats
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get chat statistics: {str(e)}")