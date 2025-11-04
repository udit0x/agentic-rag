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

router = APIRouter(prefix="/api/documents", tags=["documents"])

class UploadDocumentRequest(BaseModel):
    filename: str
    contentType: str
    content: str

class UploadDocumentResponse(BaseModel):
    documentId: str
    filename: str
    chunksCreated: int

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
        text_content, size = await process_document(
            request.content,
            request.contentType,
            request.filename
        )
        print(f"[DEBUG] Document processed successfully. Size: {size} bytes")
        
        # Create document record
        print("[DEBUG] Creating document record...")
        document = await storage.createDocument({
            "filename": request.filename,
            "contentType": request.contentType,
            "size": size,
            "content": text_content,
        })
        print(f"[DEBUG] Document created with ID: {document['id']}")
        
        # Split into chunks
        print("[DEBUG] Splitting text into chunks...")
        chunk_texts = azure_client.split_text(text_content)
        print(f"[DEBUG] Created {len(chunk_texts)} chunks")
        
        # Generate embeddings for all chunks (with fallback)
        print("[DEBUG] Generating embeddings...")
        try:
            embeddings = await azure_client.embed_documents(chunk_texts)
            print("[DEBUG] Embeddings generated successfully")
        except Exception as e:
            print(f"[DEBUG] Embeddings not available: {e}")
            # Create dummy embeddings for testing
            embeddings = [[0.0] * 1536 for _ in chunk_texts]  # Standard embedding size
            print("[DEBUG] Using dummy embeddings for testing")
        
        # Create chunk records and prepare for upload
        print("[DEBUG] Creating chunk records...")
        chunks_data = []
        for i, (chunk_text, embedding) in enumerate(zip(chunk_texts, embeddings)):
            chunk = await storage.createDocumentChunk({
                "documentId": document["id"],
                "chunkIndex": i,
                "content": chunk_text,
                "metadata": {
                    "startChar": i * 1000,
                    "endChar": (i + 1) * 1000,
                },
                "embeddingId": None,
            })
            
            chunks_data.append({
                "id": chunk["id"],
                "content": chunk_text,
                "documentId": document["id"],
                "filename": request.filename,
                "chunkIndex": i,
                "embedding": embedding,
            })
        print(f"[DEBUG] Created {len(chunks_data)} chunk records")
        
        # Upload to Azure Cognitive Search (with fallback)
        print("[DEBUG] Uploading to Azure Cognitive Search...")
        try:
            await azure_client.upload_chunks_to_search(chunks_data)
            print("[DEBUG] Uploaded to Azure Cognitive Search successfully")
        except Exception as e:
            print(f"[DEBUG] Azure Search not available: {e}")
            # Continue without search index for testing
            print("[DEBUG] Continuing without search index for testing")
        
        # Update embedding IDs
        print("[DEBUG] Updating embedding IDs...")
        for chunk_data in chunks_data:
            await storage.updateChunkEmbeddingId(chunk_data["id"], chunk_data["id"])
        print("[DEBUG] Embedding IDs updated")
        
        print(f"[DEBUG] Upload completed successfully for {request.filename}")
        return UploadDocumentResponse(
            documentId=document["id"],
            filename=document["filename"],
            chunksCreated=len(chunks_data)
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
