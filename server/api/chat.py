"""Chat and query endpoints."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Generator
import json
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from server.storage import storage
from server.azure_client import azure_client
from server.rag_chain import create_rag_answer
from server.agents.orchestrator import orchestrator
from server.agents.query_refinement import query_refinement_agent

router = APIRouter(prefix="/api", tags=["chat"])

class QueryRequest(BaseModel):
    sessionId: Optional[str] = None
    query: str
    topK: int = 3  # Level 1: Reduced from 5 to 3 for higher precision
    enableTracing: bool = True
    debugMode: bool = False
    minScoreThreshold: float = 0.65  # Level 1: Add score threshold parameter

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
    classification: Optional[Dict[str, Any]] = None
    agentTraces: Optional[List[Dict[str, Any]]] = None
    executionTimeMs: Optional[int] = None
    responseType: str = "reasoning"

class ChatHistoryResponse(BaseModel):
    sessionId: str
    messages: List[Dict[str, Any]]

class StreamedQueryRefinement(BaseModel):
    type: str  # "refinement" or "completion" 
    data: Dict[str, Any]

@router.post("/query/stream")
async def stream_query_with_refinement(request: QueryRequest):
    """
    Stream query processing: first streams refined questions, then the main response.
    
    This endpoint provides real-time feedback to users:
    1. Immediately streams 5 refined questions as they're generated
    2. Then streams the main AI response
    
    Response format:
    - First: {"type": "refinement", "data": {"refined_queries": [...], "status": "generated"}}
    - Then: {"type": "completion", "data": {"answer": "...", "sources": [...], ...}}
    """
    
    async def generate_stream():
        """Generate streaming response with refinement first, then main response."""
        try:
            # Step 1: Generate and stream refined questions immediately
            print(f"[STREAM] Generating refined questions for: {request.query}")
            
            refinement = await query_refinement_agent.generate_related_questions(request.query)
            
            # Check if refinement failed due to API error
            if refinement.query_category == "api_error":
                print("[STREAM] API error detected in query refinement - skipping refinement stream")
                # Don't stream refinement questions, proceed directly to main processing
                # The main processing will also fail and show the proper error message
            else:
                # Stream the refined questions only if no API error
                refinement_data = {
                    "type": "refinement",
                    "data": {
                        "refined_queries": refinement.refined_queries,
                        "query_category": refinement.query_category,
                        "refinement_reasoning": refinement.refinement_reasoning,
                        "status": "generated"
                    }
                }
                
                yield f"data: {json.dumps(refinement_data)}\n\n"
                
                # Small delay to allow UI to process refinement
                await asyncio.sleep(0.1)
            
            # Step 2: Process main query with standard workflow
            print(f"[STREAM] Processing main query...")
            
            # Create or get session - always ensure we have a valid session
            session = None
            if request.sessionId:
                try:
                    session = await storage.getChatSession(request.sessionId)
                    if session:
                        print(f"[STREAM] Using existing session: {request.sessionId}")
                    else:
                        print(f"[STREAM] Session {request.sessionId} not found, creating new session")
                except Exception as e:
                    print(f"[STREAM] Error retrieving session {request.sessionId}: {e}")
            
            # Create new session if we don't have one
            if not session:
                session = await storage.createChatSession({
                    "title": request.query[:50] + "..." if len(request.query) > 50 else request.query
                })
                print(f"[STREAM] Created new session: {session['id']}")
            
            # Save user message
            user_message = await storage.createMessage({
                "sessionId": session["id"],
                "role": "user", 
                "content": request.query,
                "sources": None,
            })
            
            # Configure orchestrator
            from server.agents.state import WorkflowConfig
            config: WorkflowConfig = {
                "enable_tracing": request.enableTracing,
                "max_chunks": request.topK,
                "temperature": 0.7,
                "parallel_execution": True,
                "timeout_seconds": 30,
                "debug_mode": request.debugMode,
            }
            orchestrator.config = config
            
            # Execute multi-agent workflow
            agent_result = await orchestrator.process_query(
                query=request.query,
                session_id=session["id"],
                user_id=None
            )
            
            # Check for agent-level errors and propagate them
            if agent_result.get("error_message"):
                error_type = agent_result.get("error_type", "general_error")
                error_message = agent_result["error_message"]
                
                # Generate user-friendly error messages based on error type
                if error_type == "api_quota_exceeded":
                    user_friendly_message = "🚫 **API Quota Exceeded**\n\nThe OpenAI API quota has been exceeded. Please:\n- Check your OpenAI billing and usage limits\n- Verify your API key is valid and has sufficient credits\n- Try again later when your quota resets"
                elif error_type == "api_authentication_failed":
                    user_friendly_message = "🔑 **API Authentication Failed**\n\nThere's an issue with your API configuration:\n- Check that your API key is correct\n- Verify your API endpoint is properly configured\n- Ensure your API key has the necessary permissions"
                elif error_type == "api_connection_error":
                    user_friendly_message = "🌐 **API Connection Error**\n\nUnable to connect to the AI service:\n- Check your internet connection\n- Verify the API endpoint is accessible\n- The service might be temporarily unavailable"
                else:
                    user_friendly_message = f"⚠️ **Processing Error**\n\nI encountered an error while processing your question: {error_message}\n\nPlease try again or check your configuration."
                
                error_data = {
                    "type": "error",
                    "data": {
                        "error": user_friendly_message,
                        "error_type": error_type,
                        "technical_details": error_message,
                        "status": "failed"
                    }
                }
                yield f"data: {json.dumps(error_data)}\n\n"
                return
            
            # Format sources
            sources = []
            for chunk in agent_result.get("sources", []):
                sources.append({
                    "documentId": chunk["documentId"],
                    "chunkId": chunk["id"],
                    "filename": chunk["filename"],
                    "excerpt": chunk["content"][:200] + "..." if len(chunk["content"]) > 200 else chunk["content"],
                    "score": chunk["score"],
                })
            
            # Save assistant message
            assistant_message = await storage.createMessage({
                "sessionId": session["id"],
                "role": "assistant",
                "content": agent_result["final_response"],
                "sources": sources,
            })
            
            # Format agent traces for response (if tracing enabled)
            agent_traces = None
            if request.enableTracing and agent_result.get("agent_traces"):
                agent_traces = []
                for trace in agent_result["agent_traces"]:
                    # Handle both trace formats (new and legacy)
                    agent_name = trace.get("agentName") or trace.get("agent_name", "unknown")
                    start_time = trace.get("startTime") or trace.get("start_time")
                    end_time = trace.get("endTime") or trace.get("end_time")
                    duration = trace.get("durationMs") or trace.get("duration_ms", 0)
                    
                    # Convert datetime objects to ISO strings if needed
                    if hasattr(start_time, 'isoformat'):
                        start_time = start_time.isoformat()
                    if hasattr(end_time, 'isoformat'):
                        end_time = end_time.isoformat()
                    
                    agent_traces.append({
                        "agentName": agent_name,
                        "startTime": start_time or "",
                        "endTime": end_time,
                        "durationMs": duration,
                        "inputData": trace.get("inputData", trace.get("input_data", {})),
                        "outputData": trace.get("outputData", trace.get("output_data", {})),
                        "error": trace.get("error"),
                    })
            
            # Stream the completion
            completion_data = {
                "type": "completion",
                "data": {
                    "sessionId": session["id"],
                    "messageId": assistant_message["id"],
                    "answer": agent_result["final_response"],
                    "sources": sources,
                    "classification": agent_result.get("classification"),
                    "agentTraces": agent_traces,  # Now properly formatted!
                    "executionTimeMs": agent_result.get("total_execution_time"),
                    "responseType": agent_result.get("response_type", "reasoning"),
                    "refined_queries_used": refinement.refined_queries  # Include for reference
                }
            }
            
            yield f"data: {json.dumps(completion_data)}\n\n"
            
        except Exception as e:
            # Detect specific error types for better user feedback
            error_message = str(e)
            error_type = "general_error"
            user_friendly_message = "I encountered an error while processing your question. Please try again."
            
            # OpenAI API Errors
            if "429" in error_message and ("quota" in error_message.lower() or "rate limit" in error_message.lower()):
                error_type = "api_quota_exceeded"
                user_friendly_message = "🚫 **API Quota Exceeded**\n\nThe OpenAI API quota has been exceeded. Please:\n- Check your OpenAI billing and usage limits\n- Verify your API key is valid and has sufficient credits\n- Try again later when your quota resets"
            elif "401" in error_message and "api" in error_message.lower():
                error_type = "api_authentication_failed"
                user_friendly_message = "🔑 **API Authentication Failed**\n\nThere's an issue with your API configuration:\n- Check that your API key is correct\n- Verify your API endpoint is properly configured\n- Ensure your API key has the necessary permissions"
            elif "openai" in error_message.lower() and ("api" in error_message.lower() or "connection" in error_message.lower()):
                error_type = "api_connection_error"
                user_friendly_message = "🌐 **API Connection Error**\n\nUnable to connect to the OpenAI API:\n- Check your internet connection\n- Verify the API endpoint is accessible\n- The OpenAI service might be temporarily unavailable"
            elif "azure" in error_message.lower() and ("api" in error_message.lower() or "connection" in error_message.lower()):
                error_type = "azure_api_error"
                user_friendly_message = "🌐 **Azure API Error**\n\nUnable to connect to Azure OpenAI:\n- Check your Azure endpoint configuration\n- Verify your Azure API key is valid\n- Ensure your deployment is active"
            
            print(f"[ERROR] Stream processing failed: {error_message}")
            
            error_data = {
                "type": "error",
                "data": {
                    "error": user_friendly_message,
                    "error_type": error_type,
                    "technical_details": error_message,
                    "status": "failed"
                }
            }
            yield f"data: {json.dumps(error_data)}\n\n"
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream"
        }
    )

@router.post("/query", response_model=QueryResponse)
async def query_documents(request: QueryRequest):
    """
    Query documents using multi-agent orchestration.
    
    1. Create or get chat session
    2. Save user message
    3. Execute multi-agent workflow (Router -> Retriever -> Reasoning/Simulation/Temporal)
    4. Save assistant message
    5. Return response with citations and agent traces
    """
    try:
        # Create or get session
        if request.sessionId:
            session = await storage.getChatSession(request.sessionId)
            if not session:
                session = await storage.createChatSession({
                    "title": request.query[:50] + "..." if len(request.query) > 50 else request.query
                })
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
        
        # Configure orchestrator based on request
        from server.agents.state import WorkflowConfig
        config: WorkflowConfig = {
            "enable_tracing": request.enableTracing,
            "max_chunks": request.topK,
            "temperature": 0.7,
            "parallel_execution": True,
            "timeout_seconds": 30,
            "debug_mode": request.debugMode,
        }
        
        # Update orchestrator config
        orchestrator.config = config
        
        # Execute multi-agent workflow
        agent_result = await orchestrator.process_query(
            query=request.query,
            session_id=session["id"],
            user_id=None  # TODO: Add user authentication in future
        )
        
        # Check for workflow errors
        if agent_result.get("error_message"):
            raise HTTPException(
                status_code=500,
                detail=f"Agent workflow failed: {agent_result['error_message']}"
            )
        
        # Format sources for response
        sources = []
        for chunk in agent_result.get("sources", []):
            sources.append({
                "documentId": chunk["documentId"],
                "chunkId": chunk["id"],
                "filename": chunk["filename"],
                "excerpt": chunk["content"][:200] + "..." if len(chunk["content"]) > 200 else chunk["content"],
                "score": chunk["score"],
            })
        
        # Save assistant message with enhanced metadata
        assistant_message = await storage.createMessage({
            "sessionId": session["id"],
            "role": "assistant",
            "content": agent_result["final_response"],
            "sources": sources,
        })
        
        # Format agent traces for response (if tracing enabled)
        agent_traces = None
        if request.enableTracing and agent_result.get("agent_traces"):
            agent_traces = []
            for trace in agent_result["agent_traces"]:
                # Handle both trace formats (new and legacy)
                agent_name = trace.get("agentName") or trace.get("agent_name", "unknown")
                start_time = trace.get("startTime") or trace.get("start_time")
                end_time = trace.get("endTime") or trace.get("end_time")
                duration = trace.get("durationMs") or trace.get("duration_ms", 0)
                
                # Convert datetime objects to ISO strings if needed
                if hasattr(start_time, 'isoformat'):
                    start_time = start_time.isoformat()
                if hasattr(end_time, 'isoformat'):
                    end_time = end_time.isoformat()
                
                agent_traces.append({
                    "agentName": agent_name,
                    "startTime": start_time or "",
                    "endTime": end_time,
                    "durationMs": duration,
                    "inputData": trace.get("inputData", trace.get("input_data", {})),
                    "outputData": trace.get("outputData", trace.get("output_data", {})),
                    "error": trace.get("error"),
                })
        
        return QueryResponse(
            sessionId=session["id"],
            messageId=assistant_message["id"],
            answer=agent_result["final_response"],
            sources=[SourceInfo(**source) for source in sources],
            classification=agent_result.get("classification"),
            agentTraces=agent_traces,
            executionTimeMs=agent_result.get("total_execution_time"),
            responseType=agent_result.get("response_type", "reasoning")
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
