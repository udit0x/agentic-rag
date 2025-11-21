"""Chat and query endpoints."""
import logging
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Generator
import json
import asyncio
import sys
from pathlib import Path
from datetime import datetime
from server.datetime_utils import utc_now
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from server.storage import storage
from server.azure_client import azure_client
from server.rag_chain import create_rag_answer
from server.agents.orchestrator import orchestrator
from server.config_manager import config_manager, AppConfig, LLMConfig, EmbeddingsConfig
from server.agents.query_refinement import query_refinement_agent
from server.agents.title_generator import title_generator
from server.auth_middleware import get_authenticated_user_id, require_authenticated_user
from server.error_utils import safe_error_response
from server.hybrid_middleware import get_api_key_for_request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["chat"])

class QueryRequest(BaseModel):
    sessionId: Optional[str] = None
    query: str
    topK: int = 3  # Level 1: Reduced from 5 to 3 for higher precision
    enableTracing: bool = True
    debugMode: bool = False
    minScoreThreshold: float = 0.65  # Level 1: Add score threshold parameter
    documentIds: Optional[List[str]] = None  # Document filtering support
    useUserKey: bool = False  # If true, user is using their own API key
    userApiKey: Optional[str] = None  # User's personal API key (for verification)

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
    quotaRemaining: int = -1  # -1 means unlimited
    isUnlimited: bool = False

class ChatHistoryResponse(BaseModel):
    sessionId: str
    messages: List[Dict[str, Any]]
    updatedAt: str  # ISO timestamp of session's last update

class GenerateTitleRequest(BaseModel):
    sessionId: str
    query: str
    assistantResponse: Optional[str] = None

class GenerateTitleResponse(BaseModel):
    sessionId: str
    title: str

class StreamedQueryRefinement(BaseModel):
    type: str  # "refinement" or "completion" 
    data: Dict[str, Any]

@router.post("/query/stream")
async def stream_query_with_refinement(
    request: QueryRequest,
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    Stream query processing: first streams refined questions, then the main response.
    
    This endpoint provides real-time feedback to users:
    1. Immediately streams 5 refined questions as they're generated
    2. Then streams the main AI response
    
    Response format:
    - First: {"type": "refinement", "data": {"refined_queries": [...], "status": "generated"}}
    - Then: {"type": "completion", "data": {"answer": "...", "sources": [...], ...}}
    
    Security:
    - User ID extracted from Clerk JWT token (cannot be spoofed)
    - All sessions and data scoped to authenticated user
    - Quota enforced before processing query
    """
    
    logger.info("Streaming request from user %s: %s (session: %s)", 
                authenticated_user_id, request.query[:50], request.sessionId)
    
    # ============================================
    # QUOTA ENFORCEMENT - Check and get API key
    # ============================================
    from server.database_postgresql import PostgreSQLConnection
    db = PostgreSQLConnection()
    await db.connect()
    
    try:
        # Get appropriate API key (personal or backend) and check quota
        key_result = await get_api_key_for_request(authenticated_user_id, db)
        
        if not key_result["allowed"]:
            # Return quota exhausted error as a stream event
            async def quota_error_stream():
                error_data = {
                    "type": "quota_exhausted",
                    "data": {
                        "error": "Quota exhausted",
                        "message": key_result.get("error", "You have reached your API usage limit."),
                        "remaining": 0,
                        "status": "quota_exhausted"
                    }
                }
                yield f"data: {json.dumps(error_data)}\n\n"
            
            return StreamingResponse(
                quota_error_stream(),
                media_type="text/plain",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "Content-Type": "text/event-stream"
                }
            )
        
        logger.info("Using %s API key - quota remaining: %s", 
                   key_result['source'], key_result.get('quota_remaining', 'unlimited'))
        
        # Get quota remaining for response
        quota_remaining = key_result.get("quota_remaining", -1)  # -1 means unlimited
    except HTTPException as e:
        # Re-raise HTTP exceptions (auth failures, etc.)
        raise
    except Exception as e:
        raise safe_error_response(
            status_code=500,
            user_message="Unable to process request",
            exception=e,
            log_context="Quota check failed"
        )
    
    async def generate_stream():
        """Generate streaming response with main processing immediately, refinement in parallel."""
        try:
            # Debug logging for document filtering
            if request.documentIds:
                logger.debug("Document filter: %s", request.documentIds)
            else:
                logger.debug("No document filter - searching all documents")
            
            # 🚀 OPTIMIZATION: Create or get session FIRST (before sending started event)
            # This allows us to include session ID in the started event for immediate frontend updates
            session = None
            # Skip lookup for temp session IDs or None - create immediately
            if request.sessionId and not request.sessionId.startswith("temp-session-"):
                try:
                    session = await storage.getChatSession(request.sessionId)
                    # ✅ SECURITY: Validate session ownership using authenticated user ID from JWT
                    if session.get("userId") and session.get("userId") != authenticated_user_id:
                        raise HTTPException(
                            status_code=403, 
                            detail=f"Access denied: Session {request.sessionId} belongs to a different user"
                        )
                    logger.debug("Using existing session: %s", session['id'])
                except HTTPException:
                    raise  # Re-raise authorization errors
                except Exception as e:
                    logger.warning("Error retrieving session %s: %s, creating new one", request.sessionId, str(e))

            # Create new session if we don't have one
            if not session:
                # 🚀 OPTIMIZATION: Use simple temporary title to avoid blocking on LLM call
                # The proper title will be generated later with assistant response context
                temporary_title = request.query[:50] + "..." if len(request.query) > 50 else request.query
                session = await storage.createChatSession({
                    "title": temporary_title,
                    "userId": authenticated_user_id  # ✅ SECURITY: Use authenticated user ID from JWT
                })
                logger.info("Created new session %s for user %s with temporary title: %s", 
                           session['id'], authenticated_user_id, temporary_title)
            
            # Create user message in database
            # Note: Frontend already has optimistic message displayed
            # We just need to persist it in the database for history
            user_message = await storage.createMessage({
                "sessionId": session["id"],
                "role": "user",
                "content": request.query
            })
            
            # Send "started" event with session ID and user message ID
            # Frontend needs the user message ID to link optimistic message to server record
            started_data = {
                "type": "started",
                "data": {
                    "sessionId": session["id"],
                    "userMessageId": user_message["id"]  # Send ID for frontend to link optimistic → server
                }
            }
            yield f"data: {json.dumps(started_data)}\n\n"
            
            # ============================================
            # PHASE 3: Configure orchestrator
            # ============================================
            
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
            
            # ============================================
            # INJECT PERSONAL KEY CONFIG (if using personal key)
            # ============================================
            if key_result['source'] == 'personal':
                try:
                    # Build personal key configuration
                    provider = key_result['provider']
                    api_key = key_result['api_key']
                    
                    # Create LLM config
                    llm_config = LLMConfig(
                        provider=provider,
                        api_key=api_key,
                        model="gpt-4o" if provider == "azure" else "gpt-4o",
                        endpoint=key_result.get('azure_endpoint') if provider == 'azure' else None,
                        deployment_name=key_result.get('azure_deployment') if provider == 'azure' else None,
                        temperature=0.7,
                        max_tokens=4096
                    )
                    
                    # Create Embeddings config (use same key/provider)
                    embeddings_config = EmbeddingsConfig(
                        provider=provider,
                        api_key=api_key,
                        model="text-embedding-3-large" if provider != "azure" else "text-embedding-3-large",
                        endpoint=key_result.get('azure_endpoint') if provider == 'azure' else None,
                        deployment_name="text-embedding-3-large" if provider == 'azure' else None
                    )
                    
                    # Create document limits config (use defaults for personal keys)
                    from server.config_manager import DocumentLimitsConfig
                    document_limits = DocumentLimitsConfig(
                        max_file_size_mb=10.0,
                        max_extracted_chars=500000,
                        max_chunks=1000,
                        warn_file_size_mb=5.0,
                        warn_extracted_chars=250000
                    )
                    
                    # Create request-scoped AppConfig
                    from datetime import datetime
                    personal_config = AppConfig(
                        llm=llm_config,
                        embeddings=embeddings_config,
                        document_limits=document_limits,
                        source="personal",
                        version="user-personal-key",
                        environment="production",
                        useGeneralKnowledge=key_result.get('use_general_knowledge', True),
                        documentRelevanceThreshold=key_result.get('document_relevance_threshold', 0.65),
                        updated_at=utc_now()
                    )
                    
                    # Inject into config_manager for this request
                    config_manager.set_request_config(personal_config)
                    logger.info("Injected personal %s config for request", provider)
                except Exception as e:
                    logger.error("Failed to inject personal config: %s", str(e))
            
            # ============================================
            # PHASE 4: Stream orchestrator results with intermediate updates
            # ============================================
            agent_result = None
            refinement_sent = False
            
            # Use streaming to get intermediate results
            async for chunk in orchestrator.stream_query(
                query=request.query,
                session_id=session["id"],
                user_id=authenticated_user_id,
                document_ids=request.documentIds
            ):
                # Check if this chunk contains query_refinement
                if chunk.get("query_refinement") and not refinement_sent:
                    try:
                        query_refinement = chunk["query_refinement"]
                        refined_queries = [rq["query"] for rq in query_refinement.get("refined", [])]
                        
                        if refined_queries:
                            logger.info("Streaming refinement: %d questions", len(refined_queries))
                            refinement_data = {
                                "type": "refinement",
                                "data": {
                                    "userMessageId": user_message["id"],
                                    "refined_queries": refined_queries,
                                    "intent": query_refinement.get("intent", ""),
                                    "reasoning": query_refinement.get("reasoning", ""),
                                    "status": "generated"
                                }
                            }
                            yield f"data: {json.dumps(refinement_data)}\n\n"
                            refinement_sent = True
                    except Exception as e:
                        logger.error("Failed to stream refinements: %s", str(e))
                
                # Store the last complete state
                agent_result = chunk
            
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
                    "userMessageId": user_message["id"],  # Include user message ID for refined queries mapping
                    "answer": agent_result["final_response"],
                    "sources": sources,
                    "classification": agent_result.get("classification"),
                    "agentTraces": agent_traces,
                    "executionTimeMs": agent_result.get("total_execution_time"),
                    "responseType": agent_result.get("response_type", "reasoning"),
                    "quotaRemaining": quota_remaining,  # Include quota info from hybrid middleware
                    "isUnlimited": key_result.get("is_unlimited", False),
                }
            }
            
            yield f"data: {json.dumps(completion_data)}\n\n"
            
            # ✅ Only generate title for the FIRST message in a session (not for follow-ups)
            # Check if this is the first user message by counting messages in session
            try:
                session_messages = await storage.getSessionMessages(session["id"])
                # Count user messages (we just created one, so if count > 1, this is a follow-up)
                user_message_count = sum(1 for msg in session_messages if msg.get("role") == "user")
                is_first_message = user_message_count == 1
                
                if is_first_message:
                    logger.info("First message detected - generating title")
                    # Generate final title with assistant response context (non-blocking)
                    final_title = await title_generator.generate_title(
                        query=request.query,
                        assistant_response=agent_result["final_response"],
                        enable_tracing=False
                    )
                    # Update session title if it's different and better
                    if final_title != session.get("title"):
                        await storage.updateChatSession(session["id"], {"title": final_title})
                        logger.info("Updated session title to: %s", final_title)
                        
                        # Stream title update event to notify frontend
                        title_update_data = {
                            "type": "title_update",
                            "data": {
                                "sessionId": session["id"],
                                "title": final_title,
                                "status": "updated"
                            }
                        }
                        yield f"data: {json.dumps(title_update_data)}\n\n"
                else:
                    logger.debug("Follow-up message (%d total) - skipping title generation", user_message_count)
            except Exception as e:
                logger.error("Failed to generate/check title: %s", str(e))
            
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
            
            logger.error("Stream processing failed: %s (type: %s)", error_message, error_type)
            
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
        finally:
            # Clear request-scoped config override (personal key context)
            config_manager.clear_request_config()
            logger.debug("Cleared request-scoped config override")
    
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
async def query_documents(
    request: QueryRequest,
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    Query documents using multi-agent orchestration.
    
    1. Check quota and decrement atomically
    2. Create or get chat session
    3. Save user message
    4. Execute multi-agent workflow (Router -> Retriever -> Reasoning/Simulation/Temporal)
    5. Save assistant message
    6. Return response with citations and agent traces
    
    Security:
    - Requires authenticated user (JWT token validation)
    - Enforces quota before processing
    - Filters all document retrievals to user's documents only
    - Validates session ownership before using existing sessions
    """
    # ============================================
    # QUOTA ENFORCEMENT - Check and get API key
    # ============================================
    from server.database_postgresql import PostgreSQLConnection
    db = PostgreSQLConnection()
    await db.connect()
    
    try:
        # Get appropriate API key (personal or backend) and check quota
        key_result = await get_api_key_for_request(authenticated_user_id, db)
        
        if not key_result["allowed"]:
            raise HTTPException(
                status_code=429,
                detail=key_result.get("error", "Quota exhausted. Add your personal API key to continue.")
            )
        
        logger.info("Using %s API key - quota remaining: %s", 
                   key_result['source'], key_result.get('quota_remaining', 'unlimited'))
        
        # Get quota remaining for response
        quota_remaining = key_result.get("quota_remaining", -1)  # -1 means unlimited
        
        # Create or get session
        if request.sessionId:
            session = await storage.getChatSession(request.sessionId)
            if session:
                # ✅ SECURITY: Validate session ownership
                if session.get("userId") and session.get("userId") != authenticated_user_id:
                    raise HTTPException(
                        status_code=403,
                        detail=f"Access denied: Session {request.sessionId} belongs to a different user"
                    )
            else:
                # Generate a proper title for new session
                initial_title = await title_generator.generate_title(
                    query=request.query,
                    assistant_response=None,
                    enable_tracing=False
                )
                session = await storage.createChatSession({
                    "title": initial_title,
                    "userId": authenticated_user_id  # ✅ SECURITY: Associate session with authenticated user
                })
        else:
            # Generate a proper title for new session
            initial_title = await title_generator.generate_title(
                query=request.query,
                assistant_response=None,
                enable_tracing=False
            )
            session = await storage.createChatSession({
                "title": initial_title,
                "userId": authenticated_user_id  # ✅ SECURITY: Associate session with authenticated user
            })
            logger.info("Created new session %s for user %s", session['id'], authenticated_user_id)
        
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
            user_id=authenticated_user_id,  # ✅ SECURITY: Use authenticated user ID for data isolation
            document_ids=request.documentIds
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
        
        # Generate final title with assistant response context
        try:
            final_title = await title_generator.generate_title(
                query=request.query,
                assistant_response=agent_result["final_response"],
                enable_tracing=False
            )
            # Update session title if it's different and better
            if final_title != session.get("title"):
                await storage.updateChatSession(session["id"], {"title": final_title})
        except Exception as e:
            logger.error("Failed to generate final title: %s", str(e))
        
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
            responseType=agent_result.get("response_type", "reasoning"),
            quotaRemaining=quota_remaining,  # From hybrid middleware
            isUnlimited=key_result.get("is_unlimited", False)
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise safe_error_response(
            status_code=500,
            user_message="Unable to process query",
            exception=e,
            log_context="Query execution failed"
        )

@router.post("/generate-title", response_model=GenerateTitleResponse)
async def generate_title(
    request: GenerateTitleRequest,
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    Generate a concise title for a chat session based on the user query and assistant response.
    
    Security:
    - Validates session ownership before generating title
    - Returns 403 if attempting to modify another user's session
    """
    try:
        # Verify session exists
        session = await storage.getChatSession(request.sessionId)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # ✅ SECURITY: Validate session ownership
        if session.get("userId") and session.get("userId") != authenticated_user_id:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: Session {request.sessionId} belongs to a different user"
            )
        
        # Generate title using the title generator
        title = await title_generator.generate_title(
            query=request.query,
            assistant_response=request.assistantResponse,
            enable_tracing=False
        )
        
        # Update the session with the new title
        await storage.updateChatSession(request.sessionId, {"title": title})
        
        return GenerateTitleResponse(
            sessionId=request.sessionId,
            title=title
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise safe_error_response(
            status_code=500,
            user_message="Unable to generate title",
            exception=e,
            log_context="Title generation failed"
        )

@router.get("/chat/{session_id}", response_model=ChatHistoryResponse)
async def get_chat_history(
    session_id: str,
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    Get chat history for a session.
    
    Security:
    - Validates that the session belongs to the authenticated user
    - Returns 403 if attempting to access another user's session
    """
    session = await storage.getChatSession(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # ✅ SECURITY: Validate session ownership using authenticated user ID from JWT
    if session.get("userId") and session.get("userId") != authenticated_user_id:
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: Session {session_id} belongs to a different user"
        )
    
    messages = await storage.getSessionMessages(session_id)
    
    return ChatHistoryResponse(
        sessionId=session_id,
        messages=[
            {
                "id": msg["id"],
                "role": msg["role"],
                "content": msg["content"],
                "sources": msg["sources"],
                "createdAt": msg["createdAt"],
            }
            for msg in messages
        ],
        updatedAt=session["updatedAt"].isoformat() if isinstance(session["updatedAt"], datetime) else session["updatedAt"]
    )
