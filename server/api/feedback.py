"""
API endpoints for message feedback
Handles user feedback on assistant responses for quality tracking and ML training
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field, validator
from typing import Optional, Literal
from datetime import datetime
import logging

# Database and auth imports
from server.database_interface import db_storage
from server.auth_middleware import require_authenticated_user
from server.datetime_utils import utc_now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/feedback", tags=["feedback"])


class FeedbackCategory:
    """Allowed feedback categories for negative feedback"""
    IGNORED_INSTRUCTIONS = "ignored_instructions"
    FETCHED_MULTIPLE_DOCUMENTS = "fetched_multiple_documents"
    HARMFUL_OFFENSIVE = "harmful_offensive"
    FORGOT_CONTEXT = "forgot_context"
    MISSING_INFORMATION = "missing_information"
    OTHER = "other"


class SubmitFeedbackRequest(BaseModel):
    """Request model for submitting message feedback"""
    message_id: str = Field(..., description="ID of the message being rated")
    session_id: str = Field(..., description="ID of the chat session")
    feedback_type: Literal["positive", "negative"] = Field(..., description="Type of feedback")
    category: Optional[
        Literal[
            "ignored_instructions",
            "fetched_multiple_documents",
            "harmful_offensive",
            "forgot_context",
            "missing_information",
            "other",
        ]
    ] = Field(None, description="Category for negative feedback")
    detail_text: Optional[str] = Field(None, max_length=1000, description="Additional feedback details")
    
    # Context data for ML training
    query_context: Optional[dict] = Field(None, description="Query and response context")
    metadata: Optional[dict] = Field(None, description="Additional metadata")

    @validator("category")
    def validate_category(cls, v, values):
        """Category is required for negative feedback"""
        if values.get("feedback_type") == "negative" and v is None:
            raise ValueError("category is required for negative feedback")
        return v

    @validator("detail_text")
    def validate_detail_text(cls, v):
        """Sanitize detail text"""
        if v:
            return v.strip()
        return v


class FeedbackResponse(BaseModel):
    """Response model for feedback submission"""
    id: str
    message_id: str
    feedback_type: str
    created_at: datetime
    message: str = "Feedback submitted successfully"


class GetFeedbackResponse(BaseModel):
    """Response model for retrieving feedback"""
    id: str
    message_id: str
    feedback_type: str
    category: Optional[str]
    detail_text: Optional[str]
    created_at: datetime
    updated_at: datetime


@router.post("/submit", response_model=FeedbackResponse)
async def submit_feedback(
    request: SubmitFeedbackRequest,
    user_id: str = Depends(require_authenticated_user)
):
    """
    Submit feedback for a message
    
    Args:
        request: Feedback submission data
        user_id: Current authenticated user ID
    
    Returns:
        FeedbackResponse with submission confirmation
    """
    try:
        # Verify message exists and belongs to the session
        message = await db_storage.get_message(request.message_id)
        if not message:
            raise HTTPException(status_code=404, detail="Message not found")
        
        # DEBUG: Log the values for comparison
        logger.info(f"[FEEDBACK DEBUG] Message data: {message}")
        logger.info(f"[FEEDBACK DEBUG] Request session_id: {request.session_id}")
        
        # Database returns camelCase, so check sessionId field
        message_session_id = message.get("sessionId") or message.get("session_id")
        logger.info(f"[FEEDBACK DEBUG] Message session_id: {message_session_id}")
        
        if message_session_id != request.session_id:
            logger.error(f"[FEEDBACK DEBUG] Session mismatch! Message sessionId: '{message_session_id}' vs Request session_id: '{request.session_id}'")
            raise HTTPException(status_code=400, detail="Message does not belong to this session")
        
        # Verify session belongs to user
        session = await db_storage.getChatSession(request.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        logger.info(f"[FEEDBACK DEBUG] Session data: {session}")
        logger.info(f"[FEEDBACK DEBUG] User ID from auth: {user_id}")
        
        # Database returns camelCase, so check userId field
        session_user_id = session.get("userId") or session.get("user_id")
        logger.info(f"[FEEDBACK DEBUG] Session userId: {session_user_id}")
        
        if session_user_id != user_id:
            logger.error(f"[FEEDBACK DEBUG] User mismatch! Session userId: '{session_user_id}' vs Auth user_id: '{user_id}'")
            raise HTTPException(status_code=403, detail="Not authorized to submit feedback for this session")
        
        # Check if feedback already exists (one feedback per message per user)
        existing_feedback = await db_storage.get_message_feedback(request.message_id, user_id)
        if existing_feedback:
            # Update existing feedback
            feedback_id = await db_storage.update_message_feedback(
                feedback_id=existing_feedback["id"],
                feedback_type=request.feedback_type,
                category=request.category,
                detail_text=request.detail_text,
                query_context=request.query_context,
                metadata=request.metadata,
            )
            logger.info(f"Updated feedback {feedback_id} for message {request.message_id}")
        else:
            # Create new feedback
            feedback_id = await db_storage.create_message_feedback(
                message_id=request.message_id,
                session_id=request.session_id,
                user_id=user_id,
                feedback_type=request.feedback_type,
                category=request.category,
                detail_text=request.detail_text,
                query_context=request.query_context,
                metadata=request.metadata,
            )
            logger.info(f"Created feedback {feedback_id} for message {request.message_id}")
        
        return FeedbackResponse(
            id=feedback_id,
            message_id=request.message_id,
            feedback_type=request.feedback_type,
            created_at=utc_now(),
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting feedback: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to submit feedback")


@router.get("/message/{message_id}", response_model=Optional[GetFeedbackResponse])
async def get_message_feedback_endpoint(
    message_id: str,
    user_id: str = Depends(require_authenticated_user)
):
    """
    Get feedback for a specific message by the current user
    
    Args:
        message_id: ID of the message
        user_id: Current authenticated user ID
    
    Returns:
        Feedback data if exists, None otherwise
    """
    try:
        feedback = await db_storage.get_message_feedback(message_id, user_id)
        
        if not feedback:
            return None
        
        return GetFeedbackResponse(**feedback)
    
    except Exception as e:
        logger.error(f"Error retrieving feedback: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve feedback")


@router.delete("/message/{message_id}")
async def delete_message_feedback_endpoint(
    message_id: str,
    user_id: str = Depends(require_authenticated_user)
):
    """
    Delete feedback for a specific message
    
    Args:
        message_id: ID of the message
        user_id: Current authenticated user ID
    
    Returns:
        Success confirmation
    """
    try:
        feedback = await db_storage.get_message_feedback(message_id, user_id)
        if not feedback:
            raise HTTPException(status_code=404, detail="Feedback not found")
        
        await db_storage.delete_message_feedback(feedback["id"])
        logger.info(f"Deleted feedback for message {message_id}")
        
        return {"message": "Feedback deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting feedback: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete feedback")
