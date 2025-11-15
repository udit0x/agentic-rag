"""Document retrieval helper for full document access."""
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from server.storage import storage

logger = logging.getLogger(__name__)


async def retrieve_full_documents(
    document_ids: List[str],
    user_id: Optional[str] = None,
    enable_tracing: bool = True
) -> List[Dict[str, Any]]:
    """
    Retrieve document metadata for summary generation.
    
    NOTE: Full content is NOT retrieved here. The summarization uses semantic slicing
    to retrieve only relevant chunks from Azure Search, not the entire document.
    
    Args:
        document_ids: List of document IDs to retrieve
        user_id: User ID for security isolation
        enable_tracing: Whether to track execution time
        
    Returns:
        List of documents with metadata (content will be retrieved via semantic search)
    """
    start_time = datetime.now() if enable_tracing else None
    
    try:
        logger.info("Retrieving metadata for %d document(s)", len(document_ids))
        
        # Retrieve documents from storage with user isolation
        documents = []
        for doc_id in document_ids:
            try:
                # Get document metadata only
                doc = await storage.getDocument(doc_id)
                
                if doc:
                    # Verify user ownership if user_id is provided (security check)
                    if user_id and doc.get("userId") != user_id:
                        logger.warning("Access denied: Document %s belongs to different user", doc_id)
                        continue
                    
                    # Return minimal metadata + content as fallback
                    # Content is primarily used as fallback if semantic search fails
                    documents.append({
                        "id": doc["id"],
                        "filename": doc["filename"],
                        "content": doc.get("content", ""),  # Fallback only
                        "contentType": doc.get("contentType", ""),
                        "size": doc.get("size", 0),
                        "createdAt": doc.get("createdAt"),
                        "metadata": {
                            "userId": doc.get("userId"),
                            "chunkCount": doc.get("chunkCount", 0)
                        }
                    })
                    logger.debug("Retrieved metadata: %s (ID: %s)", doc['filename'], doc_id)
                else:
                    logger.warning("Document not found: %s", doc_id)
            except Exception as e:
                logger.error("Error retrieving document %s: %s", doc_id, e, exc_info=True)
        
        if enable_tracing:
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            logger.info("Retrieved %d document(s) in %dms", len(documents), duration_ms)
        
        return documents
        
    except Exception as e:
        logger.error("Error in retrieve_full_documents: %s", e, exc_info=True)
        return []
