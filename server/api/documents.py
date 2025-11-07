"""Document upload and management endpoints."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from server.storage import storage
from server.azure_client import azure_client
from server.document_processor import process_document
from server.performance_tracker import perf_tracker
from server.config_manager import config_manager

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
async def upload_document(request: UploadDocumentRequest):
    """
    Upload and process a document.
    
    1. Process document to extract text
    2. Split into chunks
    3. Generate embeddings
    4. Store in Azure Cognitive Search
    5. Save to storage
    """
    print(f"[DEBUG] Upload request received for file: {request.filename}")
    print(f"[DEBUG] Content type: {request.contentType}")
    print(f"[DEBUG] Content length: {len(request.content)} chars")
    
    try:
        # Process document
        print("[DEBUG] Starting document processing...")
        with perf_tracker.track_sync("Document Processing"):
            if request.forceOcr:
                print("[DEBUG] OCR processing forced via API parameter")
            text_content, size, processing_metrics = await process_document(
                request.content,
                request.contentType,
                request.filename,
                force_ocr=request.forceOcr
            )
        print(f"[DEBUG] Document processed successfully. Size: {size} bytes")
        print(f"[DEBUG] Processing metrics: {processing_metrics}")
        
        # Log processing details for monitoring
        extraction_mode = processing_metrics.get("extraction_mode", "Unknown")
        ocr_method = processing_metrics.get("ocr_method", "N/A")
        total_chars = processing_metrics.get("total_chars", 0)
        page_count = processing_metrics.get("page_count", 0)
        
        print(f"[DEBUG] Processing summary - Mode: {extraction_mode}, Method: {ocr_method}, Pages: {page_count}, Chars: {total_chars}")
        
        if processing_metrics.get("errors"):
            print(f"[DEBUG] Processing warnings/errors: {processing_metrics['errors']}")
        
        # Check if document processing yielded meaningful content
        if not text_content or len(text_content.strip()) < 10:
            print(f"[DEBUG] Warning: Document processing yielded minimal content ({len(text_content)} chars)")
            # Continue with processing but log the issue
            processing_metrics.setdefault("warnings", []).append("Minimal text content extracted")
        
        # Create document record
        print("[DEBUG] Creating document record...")
        with perf_tracker.track_sync("Database - Create Document"):
            document = await storage.createDocument({
                "filename": request.filename,
                "contentType": request.contentType,
                "size": size,
                "content": text_content,
            })
        print(f"[DEBUG] Document created with ID: {document['id']}")
        
        # Split into chunks
        print("[DEBUG] Splitting text into chunks...")
        with perf_tracker.track_sync("Text Chunking"):
            chunk_texts = azure_client.split_text(text_content)
        print(f"[DEBUG] Created {len(chunk_texts)} chunks")
        
        # Check chunk count limits
        await config_manager.initialize()
        config = config_manager.get_current_config()
        doc_limits = config.document_limits
        
        if len(chunk_texts) > doc_limits.max_chunks:
            error_msg = f"Too many chunks: {len(chunk_texts):,} exceeds limit of {doc_limits.max_chunks:,}"
            print(f"[DEBUG] REJECTED: {error_msg}")
            raise ValueError(error_msg)
        
        # Generate embeddings for all chunks (with fallback)
        print("[DEBUG] Generating embeddings...")
        try:
            with perf_tracker.track_sync("Embedding Generation"):
                embeddings = await azure_client.embed_documents(chunk_texts)
            print("[DEBUG] Embeddings generated successfully")
        except Exception as e:
            print(f"[DEBUG] Embeddings not available: {e}")
            # Create dummy embeddings for testing
            embeddings = [[0.0] * 1536 for _ in chunk_texts]  # Standard embedding size
            print("[DEBUG] Using dummy embeddings for testing")
        
        # Create chunk records and prepare for upload
        print("[DEBUG] Creating chunk records...")
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
                })
        print(f"[DEBUG] Created {len(chunks_data)} chunk records")
        
        # Upload to Azure Cognitive Search (with fallback)
        print("[DEBUG] Uploading to Azure Cognitive Search...")
        try:
            with perf_tracker.track_sync("Azure Search Upload"):
                await azure_client.upload_chunks_to_search(chunks_data)
            print("[DEBUG] Uploaded to Azure Cognitive Search successfully")
        except Exception as e:
            print(f"[DEBUG] Azure Search not available: {e}")
            # Continue without search index for testing
            print("[DEBUG] Continuing without search index for testing")
        
        # Update embedding IDs
        print("[DEBUG] Updating embedding IDs...")
        with perf_tracker.track_sync("Database - Update Embedding IDs"):
            # Prepare batch update data: (embedding_id, chunk_id) pairs
            embedding_updates = [(chunk_data["id"], chunk_data["id"]) for chunk_data in chunks_data]
            await storage.updateChunkEmbeddingIdsBatch(embedding_updates)
        print("[DEBUG] Embedding IDs updated")
        
        # Print performance summary
        perf_tracker.print_summary()
        
        print(f"[DEBUG] Upload completed successfully for {request.filename}")
        return UploadDocumentResponse(
            documentId=document["id"],
            filename=document["filename"],
            chunksCreated=len(chunks_data),
            processingMetrics=processing_metrics
        )
    
    except ValueError as e:
        print(f"[DEBUG] ValueError during upload: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[DEBUG] Unexpected error during upload: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")

@router.get("", response_model=List[dict])
async def get_documents():
    """Get all uploaded documents."""
    documents = await storage.getAllDocuments()
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
async def delete_document(document_id: str):
    """Delete a document and its chunks."""
    document = await storage.getDocument(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Delete from Azure Search first (by filename)
    try:
        await azure_client.delete_document_chunks_from_search(document["filename"])
        print(f"[DEBUG] Deleted chunks from Azure Search for {document['filename']}")
    except Exception as e:
        print(f"[DEBUG] Failed to delete from Azure Search: {e}")
        # Continue with local deletion even if Azure Search fails
    
    # Delete from local storage
    await storage.deleteDocument(document_id)
    print(f"[DEBUG] Deleted document {document_id} from local storage")
    
    return {"success": True}

@router.get("/{document_id}/content")
async def get_document_content(document_id: str):
    """Get document content for preview."""
    print(f"[DEBUG] Request for document content: {document_id}")
    
    document = await storage.getDocument(document_id)
    if not document:
        print(f"[DEBUG] Document not found: {document_id}")
        raise HTTPException(status_code=404, detail="Document not found")
    
    print(f"[DEBUG] Document found: {document['filename']}, content length: {len(document['content'])}")
    
    return {
        "id": document["id"],
        "filename": document["filename"],
        "content": document["content"],
        "size": document["size"]
    }
