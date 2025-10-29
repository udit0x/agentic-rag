"""Chat and query endpoints."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from server.storage import storage
from server.azure_client import azure_client
from server.rag_chain import create_rag_answer

router = APIRouter(prefix="/api", tags=["chat"])

class QueryRequest(BaseModel):
    sessionId: Optional[str] = None
    query: str
    topK: int = 5

class SourceInfo(BaseModel):
    documentId: str
    chunkId: str
    filename: str
    excerpt: str
    score: float

class QueryResponse(BaseModel):
    sessionId: str
    messageId: str
    answer: str
    sources: List[SourceInfo]

class ChatHistoryResponse(BaseModel):
    sessionId: str
    messages: List[Dict[str, Any]]

@router.post("/query", response_model=QueryResponse)
async def query_documents(request: QueryRequest):
    """
    Query documents and get AI-generated answer with sources.
    
    1. Create or get chat session
    2. Save user message
    3. Perform semantic search
    4. Generate answer using RAG chain
    5. Save assistant message
    6. Return response with citations
    """
    try:
        # Create or get session
        if request.sessionId:
            session = await storage.getChatSession(request.sessionId)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
        else:
            session = await storage.createChatSession({
                "title": request.query[:50] + "..." if len(request.query) > 50 else request.query
            })
        
        # Save user message
        user_message = await storage.createMessage({
            "sessionId": session["id"],
            "role": "user",
            "content": request.query,
            "sources": None,
        })
        
        # Perform semantic search
        search_results = await azure_client.semantic_search(
            query=request.query,
            top_k=request.topK
        )
        
        if not search_results:
            raise HTTPException(
                status_code=404,
                detail="No relevant documents found. Please upload documents first."
            )
        
        # Generate answer using RAG chain
        answer = await create_rag_answer(request.query, search_results)
        
        # Format sources
        sources = []
        for result in search_results:
            sources.append({
                "documentId": result["documentId"],
                "chunkId": result["id"],
                "filename": result["filename"],
                "excerpt": result["content"][:200] + "..." if len(result["content"]) > 200 else result["content"],
                "score": result["score"],
            })
        
        # Save assistant message
        assistant_message = await storage.createMessage({
            "sessionId": session["id"],
            "role": "assistant",
            "content": answer,
            "sources": sources,
        })
        
        return QueryResponse(
            sessionId=session["id"],
            messageId=assistant_message["id"],
            answer=answer,
            sources=[SourceInfo(**source) for source in sources]
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")

@router.get("/chat/{session_id}", response_model=ChatHistoryResponse)
async def get_chat_history(session_id: str):
    """Get chat history for a session."""
    session = await storage.getChatSession(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    messages = await storage.getSessionMessages(session_id)
    
    return ChatHistoryResponse(
        sessionId=session_id,
        messages=[
            {
                "id": msg["id"],
                "role": msg["role"],
                "content": msg["content"],
                "sources": msg["sources"],
                "createdAt": msg["createdAt"].isoformat(),
            }
            for msg in messages
        ]
    )
