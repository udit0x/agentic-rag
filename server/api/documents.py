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
    try:
        # Process document
        text_content, size = await process_document(
            request.content,
            request.contentType,
            request.filename
        )
        
        # Create document record
        document = await storage.createDocument({
            "filename": request.filename,
            "contentType": request.contentType,
            "size": size,
            "content": text_content,
        })
        
        # Split into chunks
        chunk_texts = azure_client.split_text(text_content)
        
        # Generate embeddings for all chunks
        embeddings = await azure_client.embed_documents(chunk_texts)
        
        # Create chunk records and prepare for upload
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
        
        # Upload to Azure Cognitive Search
        await azure_client.upload_chunks_to_search(chunks_data)
        
        # Update embedding IDs
        for chunk_data in chunks_data:
            await storage.updateChunkEmbeddingId(chunk_data["id"], chunk_data["id"])
        
        return UploadDocumentResponse(
            documentId=document["id"],
            filename=document["filename"],
            chunksCreated=len(chunks_data)
        )
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
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
            "uploadedAt": doc["uploadedAt"].isoformat(),
        }
        for doc in documents
    ]

@router.delete("/{document_id}")
async def delete_document(document_id: str):
    """Delete a document and its chunks."""
    document = await storage.getDocument(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    await storage.deleteDocument(document_id)
    return {"success": True}
