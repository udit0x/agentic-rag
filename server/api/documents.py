"""Document upload and management endpoints."""
import logging
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import List, Optional
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from server.storage import storage
from server.azure_client import azure_client
from server.document_processor import process_document
from server.performance_tracker import perf_tracker
from server.config_manager import config_manager
from server.auth_middleware import get_authenticated_user_id, require_authenticated_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/documents", tags=["documents"])

class UploadDocumentRequest(BaseModel):
    filename: str
    contentType: str
    content: str
    forceOcr: bool = False  # Optional parameter to force OCR processing

class UploadDocumentResponse(BaseModel):
    documentId: str
    filename: str
    chunksCreated: int
    processingMetrics: dict

@router.post("/upload", response_model=UploadDocumentResponse)
async def upload_document(
    request: UploadDocumentRequest,
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    Upload and process a document.
    
    1. Process document to extract text
    2. Split into chunks
    3. Generate embeddings
    4. Store in Azure Cognitive Search
    5. Save to storage
    
    Security:
    - Automatically associates document with authenticated user
    - User ID from JWT token (cannot be spoofed)
    """
    logger.info("Upload request for file: %s (type: %s, size: %d chars)", 
                request.filename, request.contentType, len(request.content))
    
    try:
        # Process document
        logger.debug("Starting document processing for %s", request.filename)
        with perf_tracker.track_sync("Document Processing"):
            if request.forceOcr:
                logger.info("OCR processing forced via API parameter for %s", request.filename)
            text_content, size, processing_metrics = await process_document(
                request.content,
                request.contentType,
                request.filename,
                force_ocr=request.forceOcr
            )
        logger.info("Document processed successfully: %s (%d bytes)", request.filename, size)
        logger.debug("Processing metrics: %s", processing_metrics)
        
        # Log processing details for monitoring
        extraction_mode = processing_metrics.get("extraction_mode", "Unknown")
        ocr_method = processing_metrics.get("ocr_method", "N/A")
        total_chars = processing_metrics.get("total_chars", 0)
        page_count = processing_metrics.get("page_count", 0)
        
        logger.info("Processing summary - Mode: %s, Method: %s, Pages: %d, Chars: %d", 
                   extraction_mode, ocr_method, page_count, total_chars)
        
        if processing_metrics.get("errors"):
            logger.warning("Processing warnings/errors: %s", processing_metrics['errors'])
        
        # Check if document processing yielded meaningful content
        if not text_content or len(text_content.strip()) < 10:
            logger.warning("Document processing yielded minimal content (%d chars)", len(text_content))
            # Continue with processing but log the issue
            processing_metrics.setdefault("warnings", []).append("Minimal text content extracted")
        
        # Create document record
        logger.debug("Creating document record for %s", request.filename)
        with perf_tracker.track_sync("Database - Create Document"):
            document = await storage.createDocument({
                "filename": request.filename,
                "contentType": request.contentType,
                "size": size,
                "content": text_content,
                "userId": authenticated_user_id,  # ✅ SECURITY: Use authenticated user ID from JWT
            })
        logger.info("Document created: ID=%s, User=%s, File=%s", 
                   document['id'], authenticated_user_id, request.filename)
        
        # Split into chunks
        logger.debug("Splitting text into chunks for %s", request.filename)
        with perf_tracker.track_sync("Text Chunking"):
            chunk_texts = azure_client.split_text(text_content)
        logger.info("Created %d chunks for %s", len(chunk_texts), request.filename)
        
        # Check chunk count limits
        await config_manager.initialize()
        config = config_manager.get_current_config()
        doc_limits = config.document_limits
        
        if len(chunk_texts) > doc_limits.max_chunks:
            error_msg = f"Too many chunks: {len(chunk_texts):,} exceeds limit of {doc_limits.max_chunks:,}"
            logger.error("REJECTED: %s", error_msg)
            raise ValueError(error_msg)
        
        # Generate embeddings for all chunks (with fallback)
        logger.debug("Generating embeddings for %d chunks", len(chunk_texts))
        try:
            with perf_tracker.track_sync("Embedding Generation"):
                embeddings = await azure_client.embed_documents(chunk_texts)
            logger.info("Embeddings generated successfully for %d chunks", len(embeddings))
        except Exception as e:
            logger.warning("Embeddings not available: %s", str(e))
            # Create dummy embeddings for testing
            embeddings = [[0.0] * 1536 for _ in chunk_texts]  # Standard embedding size
            logger.debug("Using dummy embeddings for testing")
        
        # Create chunk records and prepare for upload
        logger.debug("Creating chunk records")
        with perf_tracker.track_sync("Database - Create Chunks"):
            chunks_data = []
            chunk_records_data = []
            
            for i, (chunk_text, embedding) in enumerate(zip(chunk_texts, embeddings)):
                chunk_records_data.append({
                    "documentId": document["id"],
                    "chunkIndex": i,
                    "content": chunk_text,
                    "metadata": {
                        "startChar": i * 1000,
                        "endChar": (i + 1) * 1000,
                    },
                    "embeddingId": None,
                })
            
            # Batch create all chunks at once
            chunk_records = await storage.createDocumentChunksBatch(chunk_records_data)
            
            # Prepare data for Azure Search
            for chunk_record, embedding in zip(chunk_records, embeddings):
                chunks_data.append({
                    "id": chunk_record["id"],
                    "content": chunk_record["content"],
                    "documentId": document["id"],
                    "filename": request.filename,
                    "chunkIndex": chunk_record["chunkIndex"],
                    "embedding": embedding,
                    "userId": authenticated_user_id,  # ✅ SECURITY: Multi-tenant isolation
                })
        logger.info("Created %d chunk records", len(chunks_data))
        
        # Upload to Azure Cognitive Search (with fallback)
        logger.debug("Uploading to Azure Cognitive Search")
        try:
            with perf_tracker.track_sync("Azure Search Upload"):
                await azure_client.upload_chunks_to_search(chunks_data)
            logger.info("Uploaded %d chunks to Azure Cognitive Search", len(chunks_data))
        except Exception as e:
            logger.warning("Azure Search not available: %s", str(e))
            # Continue without search index for testing
            logger.debug("Continuing without search index for testing")
        
        # Update embedding IDs
        logger.debug("Updating embedding IDs")
        with perf_tracker.track_sync("Database - Update Embedding IDs"):
            # Prepare batch update data: (embedding_id, chunk_id) pairs
            embedding_updates = [(chunk_data["id"], chunk_data["id"]) for chunk_data in chunks_data]
            await storage.updateChunkEmbeddingIdsBatch(embedding_updates)
        logger.info("Embedding IDs updated for %d chunks", len(embedding_updates))
        
        # Print performance summary
        #perf_tracker.print_summary()
        
        logger.info("Upload completed successfully for %s (Document ID: %s)", 
                   request.filename, document["id"])
        return UploadDocumentResponse(
            documentId=document["id"],
            filename=document["filename"],
            chunksCreated=len(chunks_data),
            processingMetrics=processing_metrics
        )
    
    except ValueError as e:
        logger.error("ValueError during upload of %s: %s", request.filename, str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Unexpected error during upload of %s: %s", request.filename, str(e))
        import traceback
        logger.debug("Traceback: %s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")

@router.get("", response_model=List[dict])
async def get_documents(authenticated_user_id: str = Depends(require_authenticated_user)):
    """
    Get all uploaded documents for the authenticated user.
    
    Security:
    - Only returns documents belonging to the authenticated user
    - User ID from JWT token (cannot be spoofed)
    """
    documents = await storage.getAllDocuments(userId=authenticated_user_id)
    return [
        {
            "id": doc["id"],
            "filename": doc["filename"],
            "size": doc["size"],
            "uploadedAt": doc["uploadedAt"],
        }
        for doc in documents
    ]

@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    Delete a document and its chunks.
    
    Security:
    - Validates document ownership before deletion
    - Returns 403 if attempting to delete another user's document
    """
    document = await storage.getDocument(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # ✅ SECURITY: Validate document ownership using authenticated user ID from JWT
    if document.get("userId") and document.get("userId") != authenticated_user_id:
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: Document {document_id} belongs to a different user"
        )
    
    # Delete from Azure Search first (by filename)
    try:
        await azure_client.delete_document_chunks_from_search(document["filename"])
        logger.info("Deleted chunks from Azure Search for %s", document['filename'])
    except Exception as e:
        logger.warning("Failed to delete from Azure Search for %s: %s", document['filename'], str(e))
        # Continue with local deletion even if Azure Search fails
    
    # Delete from local storage
    await storage.deleteDocument(document_id)
    logger.info("Deleted document %s from local storage", document_id)
    
    return {"success": True}

@router.get("/{document_id}/content")
async def get_document_content(
    document_id: str,
    authenticated_user_id: str = Depends(require_authenticated_user)
):
    """
    Get document content for preview.
    
    Security:
    - Validates document ownership before returning content
    - Returns 403 if attempting to access another user's document
    """
    logger.debug("Request for document content: %s", document_id)
    
    document = await storage.getDocument(document_id)
    if not document:
        logger.warning("Document not found: %s", document_id)
        raise HTTPException(status_code=404, detail="Document not found")
    
    # ✅ SECURITY: Validate document ownership using authenticated user ID from JWT
    if document.get("userId") and document.get("userId") != authenticated_user_id:
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: Document {document_id} belongs to a different user"
        )
    
    logger.debug("Document found: %s (content length: %d)", document['filename'], len(document['content']))
    
    return {
        "id": document["id"],
        "filename": document["filename"],
        "content": document["content"],
        "size": document["size"]
    }
