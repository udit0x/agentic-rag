"""User management endpoints for authentication and profile handling."""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid

from server.database_interface import db_storage
from server.auth_middleware import require_authenticated_user
from server.hybrid_middleware import (
    save_user_personal_key,
    remove_user_personal_key,
    get_user_key_status
)

router = APIRouter(prefix="/api/users", tags=["users"])

# Request/Response Models
class SyncUserRequest(BaseModel):
    """Request model for syncing user from Clerk."""
    id: str  # Clerk user ID
    email: EmailStr
    name: str
    picture: Optional[str] = None
    locale: Optional[str] = "en"
    preferences: Optional[Dict[str, Any]] = None

class CreateUserRequest(BaseModel):
    email: EmailStr
    name: str
    picture: Optional[str] = None
    locale: Optional[str] = "en"
    preferences: Optional[Dict[str, Any]] = None

class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    picture: Optional[str] = None
    locale: Optional[str] = None
    preferences: Optional[Dict[str, Any]] = None

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = None
    locale: Optional[str] = None
    preferences: Optional[Dict[str, Any]] = None
    lastLoginAt: Optional[datetime] = None
    createdAt: datetime
    updatedAt: datetime
    isActive: bool

class UserSessionResponse(BaseModel):
    id: str
    userId: str
    sessionToken: str
    ipAddress: Optional[str] = None
    userAgent: Optional[str] = None
    isActive: bool
    expiresAt: datetime
    lastActivityAt: datetime
    createdAt: datetime

class UsersListResponse(BaseModel):
    users: List[UserResponse]
    total: int
    page: int
    limit: int

class UserStatsResponse(BaseModel):
    totalUsers: int
    activeUsers: int
    newUsersToday: int
    averageSessionsPerUser: float

# User Sync Endpoint (for Clerk integration)
@router.post("/sync", response_model=UserResponse)
async def sync_user(request: SyncUserRequest):
    """
    Sync user from Clerk authentication.
    Creates new user if doesn't exist, updates if exists.
    """
    try:
        # Check if user already exists
        existing_user = await db_storage.getUser(request.id)
        
        if existing_user:
            # Update existing user
            update_data = {
                "name": request.name,
                "picture": request.picture,
                "locale": request.locale or "en",
                "preferences": request.preferences or {},
                "lastLoginAt": datetime.now()
            }
            
            user = await db_storage.updateUser(request.id, update_data)
            
            return UserResponse(
                id=user["id"],
                email=user["email"],
                name=user["name"],
                picture=user.get("picture"),
                locale=user.get("locale"),
                preferences=user.get("preferences", {}),
                lastLoginAt=user.get("lastLoginAt"),
                createdAt=user["createdAt"],
                updatedAt=user["updatedAt"],
                isActive=user.get("isActive", True)
            )
        else:
            # Create new user with Clerk ID
            user_data = {
                "id": request.id,  # Use Clerk user ID
                "email": request.email,
                "name": request.name,
                "picture": request.picture,
                "locale": request.locale or "en",
                "preferences": request.preferences or {},
                "lastLoginAt": datetime.now()
            }
            
            user = await db_storage.createUser(user_data)
            
            return UserResponse(
                id=user["id"],
                email=user["email"],
                name=user["name"],
                picture=user.get("picture"),
                locale=user.get("locale"),
                preferences=user.get("preferences", {}),
                lastLoginAt=user.get("lastLoginAt"),
                createdAt=user["createdAt"],
                updatedAt=user["updatedAt"],
                isActive=user.get("isActive", True)
            )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync user: {str(e)}")

# User CRUD Endpoints
@router.post("/", response_model=UserResponse)
async def create_user(request: CreateUserRequest):
    """Create a new user account."""
    try:
        # Add database method for creating users
        user_data = {
            "email": request.email,
            "name": request.name,
            "picture": request.picture,
            "locale": request.locale or "en",
            "preferences": request.preferences or {}
        }
        
        user = await db_storage.createUser(user_data)
        
        return UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            picture=user.get("picture"),
            locale=user.get("locale"),
            preferences=user.get("preferences", {}),
            lastLoginAt=user.get("lastLoginAt"),
            createdAt=user["createdAt"],
            updatedAt=user["updatedAt"],
            isActive=user.get("isActive", True)
        )
    
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=409, detail="User with this email already exists")
        raise HTTPException(status_code=500, detail=f"Failed to create user: {str(e)}")

@router.get("/", response_model=UsersListResponse)
async def list_users(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search by name or email"),
    active_only: bool = Query(True, description="Show only active users")
):
    """List users with pagination and filtering."""
    try:
        users = await db_storage.getAllUsers(
            search=search,
            active_only=active_only,
            page=page,
            limit=limit
        )
        
        total = await db_storage.getUserCount(search=search, active_only=active_only)
        
        user_responses = []
        for user in users:
            user_responses.append(UserResponse(
                id=user["id"],
                email=user["email"],
                name=user["name"],
                picture=user.get("picture"),
                locale=user.get("locale"),
                preferences=user.get("preferences", {}),
                lastLoginAt=user.get("lastLoginAt"),
                createdAt=user["createdAt"],
                updatedAt=user["updatedAt"],
                isActive=user.get("isActive", True)
            ))
        
        return UsersListResponse(
            users=user_responses,
            total=total,
            page=page,
            limit=limit
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list users: {str(e)}")

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: str):
    """Get a specific user by ID."""
    try:
        user = await db_storage.getUser(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            picture=user.get("picture"),
            locale=user.get("locale"),
            preferences=user.get("preferences", {}),
            lastLoginAt=user.get("lastLoginAt"),
            createdAt=user["createdAt"],
            updatedAt=user["updatedAt"],
            isActive=user.get("isActive", True)
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get user: {str(e)}")

@router.get("/email/{email}", response_model=UserResponse)
async def get_user_by_email(email: str):
    """Get a user by email address."""
    try:
        user = await db_storage.getUserByEmail(email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            picture=user.get("picture"),
            locale=user.get("locale"),
            preferences=user.get("preferences", {}),
            lastLoginAt=user.get("lastLoginAt"),
            createdAt=user["createdAt"],
            updatedAt=user["updatedAt"],
            isActive=user.get("isActive", True)
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get user: {str(e)}")

@router.put("/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, request: UpdateUserRequest):
    """Update a user's profile."""
    try:
        user = await db_storage.getUser(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Update fields
        update_data = {}
        if request.name is not None:
            update_data["name"] = request.name
        if request.picture is not None:
            update_data["picture"] = request.picture
        if request.locale is not None:
            update_data["locale"] = request.locale
        if request.preferences is not None:
            update_data["preferences"] = request.preferences
        
        if update_data:
            updated_user = await db_storage.updateUser(user_id, update_data)
        else:
            updated_user = user
        
        return UserResponse(
            id=updated_user["id"],
            email=updated_user["email"],
            name=updated_user["name"],
            picture=updated_user.get("picture"),
            locale=updated_user.get("locale"),
            preferences=updated_user.get("preferences", {}),
            lastLoginAt=updated_user.get("lastLoginAt"),
            createdAt=updated_user["createdAt"],
            updatedAt=updated_user["updatedAt"],
            isActive=updated_user.get("isActive", True)
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update user: {str(e)}")

@router.delete("/{user_id}")
async def deactivate_user(user_id: str):
    """Deactivate a user (soft delete)."""
    try:
        user = await db_storage.getUser(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        await db_storage.deactivateUser(user_id)
        
        return {"message": "User deactivated successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to deactivate user: {str(e)}")

@router.post("/{user_id}/activate")
async def activate_user(user_id: str):
    """Reactivate a deactivated user."""
    try:
        user = await db_storage.getUser(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        await db_storage.activateUser(user_id)
        
        return {"message": "User activated successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to activate user: {str(e)}")

# User Session Management
@router.post("/{user_id}/login")
async def user_login(user_id: str, ip_address: Optional[str] = None, user_agent: Optional[str] = None):
    """Record user login and create session."""
    try:
        user = await db_storage.getUser(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        if not user.get("isActive", True):
            raise HTTPException(status_code=403, detail="User account is deactivated")
        
        # Update last login
        await db_storage.updateUserLastLogin(user_id)
        
        # Create user session
        session = await db_storage.createUserSession({
            "userId": user_id,
            "ipAddress": ip_address,
            "userAgent": user_agent
        })
        
        return {
            "message": "Login successful",
            "sessionToken": session["sessionToken"],
            "expiresAt": session["expiresAt"]
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process login: {str(e)}")

@router.post("/{user_id}/logout")
async def user_logout(user_id: str, session_token: Optional[str] = None):
    """Log out user and invalidate session."""
    try:
        if session_token:
            await db_storage.invalidateUserSession(session_token)
        else:
            # Invalidate all sessions for user
            await db_storage.invalidateAllUserSessions(user_id)
        
        return {"message": "Logout successful"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process logout: {str(e)}")

@router.get("/{user_id}/sessions", response_model=List[UserSessionResponse])
async def get_user_sessions(user_id: str, active_only: bool = Query(True)):
    """Get user's active sessions."""
    try:
        sessions = await db_storage.getUserSessions(user_id, active_only=active_only)
        
        return [
            UserSessionResponse(
                id=session["id"],
                userId=session["userId"],
                sessionToken=session["sessionToken"],
                ipAddress=session.get("ipAddress"),
                userAgent=session.get("userAgent"),
                isActive=session["isActive"],
                expiresAt=session["expiresAt"],
                lastActivityAt=session["lastActivityAt"],
                createdAt=session["createdAt"]
            )
            for session in sessions
        ]
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get user sessions: {str(e)}")

# User Chat History
@router.get("/{user_id}/chats")
async def get_user_chat_sessions(
    user_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    """Get user's chat sessions."""
    try:
        # This will use the existing getAllChatSessions method with userId filter
        sessions = await db_storage.getAllChatSessions(userId=user_id)
        
        # Apply pagination
        total = len(sessions)
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        sessions_page = sessions[start_idx:end_idx]
        
        # Get metadata for each session
        enriched_sessions = []
        for session in sessions_page:
            metadata = await db_storage.getChatSessionMetadata(session["id"])
            session.update(metadata)
            enriched_sessions.append(session)
        
        return {
            "sessions": enriched_sessions,
            "total": total,
            "page": page,
            "limit": limit,
            "hasMore": end_idx < total
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get user chat sessions: {str(e)}")

# Statistics
@router.get("/stats/overview", response_model=UserStatsResponse)
async def get_user_statistics():
    """Get user statistics for admin dashboard."""
    try:
        stats = await db_storage.getUserStatistics()
        
        return UserStatsResponse(
            totalUsers=stats["totalUsers"],
            activeUsers=stats["activeUsers"],
            newUsersToday=stats.get("newUsersToday", 0),
            averageSessionsPerUser=stats.get("averageSessionsPerUser", 0.0)
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get user statistics: {str(e)}")

# ==================== QUOTA MANAGEMENT ENDPOINTS ====================

class QuotaStatusResponse(BaseModel):
    """Response model for quota status."""
    userId: str
    email: str
    remaining: int  # -1 for unlimited
    isUnlimited: bool
    hasPersonalKey: bool

class SetApiKeyRequest(BaseModel):
    """Request model for setting personal API key."""
    apiKey: str

class ResetQuotaRequest(BaseModel):
    """Request model for resetting quota."""
    quota: int = 50

class UserPreferencesResponse(BaseModel):
    """Response model for user preferences."""
    theme: str
    enableAnimations: bool
    enableKeyboardShortcuts: bool
    useGeneralKnowledge: bool
    documentRelevanceThreshold: float
    temperature: float
    maxTokens: int

class UpdatePreferencesRequest(BaseModel):
    """Request model for updating user preferences."""
    theme: Optional[str] = None
    enableAnimations: Optional[bool] = None
    enableKeyboardShortcuts: Optional[bool] = None
    useGeneralKnowledge: Optional[bool] = None
    documentRelevanceThreshold: Optional[float] = None
    temperature: Optional[float] = None
    maxTokens: Optional[int] = None

class SetPersonalApiKeyRequest(BaseModel):
    """Request model for setting personal API key."""
    apiKey: str
    provider: str = "openai"  # openai, azure, gemini
    # Azure-specific fields (required when provider='azure')
    azureEndpoint: Optional[str] = None
    azureDeploymentName: Optional[str] = None

class PersonalKeyStatusResponse(BaseModel):
    """Response model for personal key status."""
    hasPersonalKey: bool
    provider: Optional[str]
    quotaRemaining: int
    isUnlimited: bool

@router.get("/me/quota", response_model=QuotaStatusResponse)
async def get_my_quota(
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    Get quota status for the authenticated user.
    
    Returns:
    - remaining: -1 if unlimited, otherwise number of messages left
    - isUnlimited: True for owner account
    - hasPersonalKey: True if user has configured their own API key
    """
    try:
        from server.database_postgresql import PostgreSQLConnection
        db = PostgreSQLConnection()
        await db.connect()
        
        user = await db.fetchone("SELECT email FROM users WHERE id = $1", authenticated_user_id)
        status = await get_user_key_status(authenticated_user_id, db)
        
        return QuotaStatusResponse(
            userId=authenticated_user_id,
            email=user["email"] if user else "",
            remaining=status["quota_remaining"] if not status["is_unlimited"] else -1,
            isUnlimited=status["is_unlimited"],
            hasPersonalKey=status["has_personal_key"]
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get quota status: {str(e)}")

# Admin-only endpoints (to be protected by admin middleware later)
@router.post("/{user_id}/quota/reset")
async def reset_user_quota_admin(
    user_id: str,
    request: ResetQuotaRequest,
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    [ADMIN ONLY] Reset a user's quota to a specific value.
    
    TODO: Add admin role checking
    """
    try:
        # TODO: Add admin check
        # For now, only allow owner to reset quotas
        admin_user = await db_storage.getUserByEmail("uditkashyap29@gmail.com")
        if not admin_user or admin_user["id"] != authenticated_user_id:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        updated_user = await db_storage.resetUserQuota(user_id, request.quota)
        
        return {
            "message": f"Quota reset to {request.quota}",
            "userId": user_id,
            "remaining": updated_user.get("remainingQuota") or updated_user.get("remaining_quota", 50)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset quota: {str(e)}")

@router.post("/{user_id}/quota/unlimited")
async def set_unlimited_quota_admin(
    user_id: str,
    unlimited: bool = True,
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    [ADMIN ONLY] Set unlimited quota for a user.
    
    TODO: Add admin role checking
    """
    try:
        # TODO: Add admin check
        # For now, only allow owner to set unlimited quotas
        admin_user = await db_storage.getUserByEmail("uditkashyap29@gmail.com")
        if not admin_user or admin_user["id"] != authenticated_user_id:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        updated_user = await db_storage.setUnlimitedQuota(user_id, unlimited)
        
        return {
            "message": f"Unlimited quota {'enabled' if unlimited else 'disabled'}",
            "userId": user_id,
            "isUnlimited": updated_user.get("isUnlimited") or updated_user.get("is_unlimited", False)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set unlimited quota: {str(e)}")

# ==================== USER PREFERENCES ENDPOINTS ====================

@router.get("/me/preferences", response_model=UserPreferencesResponse)
async def get_my_preferences(
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """Get user preferences (theme, settings, etc.)."""
    try:
        user = await db_storage.getUser(authenticated_user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return UserPreferencesResponse(
            theme=user.get("theme", "system"),
            enableAnimations=user.get("enable_animations", True),
            enableKeyboardShortcuts=user.get("enable_keyboard_shortcuts", True),
            useGeneralKnowledge=user.get("use_general_knowledge", True),
            documentRelevanceThreshold=float(user.get("document_relevance_threshold", 0.65)),
            temperature=float(user.get("temperature", 0.7)),
            maxTokens=int(user.get("max_tokens", 2000))
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get preferences: {str(e)}")

@router.post("/me/preferences")
async def update_my_preferences(
    request: UpdatePreferencesRequest,
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """Update user preferences."""
    try:
        update_data = {}
        
        if request.theme is not None:
            update_data["theme"] = request.theme
        if request.enableAnimations is not None:
            update_data["enable_animations"] = request.enableAnimations
        if request.enableKeyboardShortcuts is not None:
            update_data["enable_keyboard_shortcuts"] = request.enableKeyboardShortcuts
        if request.useGeneralKnowledge is not None:
            update_data["use_general_knowledge"] = request.useGeneralKnowledge
        if request.documentRelevanceThreshold is not None:
            update_data["document_relevance_threshold"] = request.documentRelevanceThreshold
        if request.temperature is not None:
            update_data["temperature"] = request.temperature
        if request.maxTokens is not None:
            update_data["max_tokens"] = request.maxTokens
        
        if update_data:
            await db_storage.updateUser(authenticated_user_id, update_data)
        
        return {"message": "Preferences updated successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update preferences: {str(e)}")

# ==================== PERSONAL API KEY ENDPOINTS (HYBRID SYSTEM) ====================

@router.get("/me/personal-key/status", response_model=PersonalKeyStatusResponse)
async def get_my_personal_key_status(
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    Check if user has a personal API key configured.
    Personal keys bypass the 50-message quota.
    """
    try:
        from server.database_postgresql import PostgreSQLConnection
        db = PostgreSQLConnection()
        await db.connect()
        
        status = await get_user_key_status(authenticated_user_id, db)
        
        return PersonalKeyStatusResponse(
            hasPersonalKey=status["has_personal_key"],
            provider=status["provider"],
            quotaRemaining=status["quota_remaining"],
            isUnlimited=status["is_unlimited"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get key status: {str(e)}")

@router.post("/me/personal-key")
async def set_my_personal_key(
    request: SetPersonalApiKeyRequest,
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    Save personal API key (encrypted).
    
    When you add your own API key:
    - You bypass the 50-message quota limit
    - Your key is encrypted before storage
    - You pay for your own API usage
    
    Supported providers: openai, azure, gemini
    
    For Azure, you must also provide:
    - azureEndpoint: Your Azure OpenAI endpoint URL
    - azureDeploymentName: Your deployment name
    """
    try:
        # Validate Azure-specific fields
        if request.provider == "azure":
            if not request.azureEndpoint or not request.azureDeploymentName:
                raise HTTPException(
                    status_code=400, 
                    detail="Azure provider requires azureEndpoint and azureDeploymentName"
                )
        
        from server.database_postgresql import PostgreSQLConnection
        db = PostgreSQLConnection()
        await db.connect()
        
        success = await save_user_personal_key(
            authenticated_user_id,
            request.apiKey,
            request.provider,
            db,
            azure_endpoint=request.azureEndpoint,
            azure_deployment_name=request.azureDeploymentName
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to save API key")
        
        return {
            "message": "Personal API key saved successfully",
            "provider": request.provider,
            "note": "You now have unlimited messages using your own API key"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set personal key: {str(e)}")

@router.delete("/me/personal-key")
async def delete_my_personal_key(
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    Remove your personal API key.
    After removal, you'll use the platform's API key with quota limits.
    """
    try:
        from server.database_postgresql import PostgreSQLConnection
        from server.config_manager import config_manager
        
        db = PostgreSQLConnection()
        await db.connect()
        
        success = await remove_user_personal_key(authenticated_user_id, db)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to remove API key")
        
        # CRITICAL: Reload config_manager to clear cached configuration
        await config_manager.reload_config()
        
        # Get updated quota status
        status = await get_user_key_status(authenticated_user_id, db)
        
        return {
            "message": "Personal API key removed successfully",
            "note": f"You now have {status['quota_remaining']} messages remaining using the platform's API key"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove personal key: {str(e)}")
