"""Document processing utilities for PDF and TXT files."""
import base64
import io
from typing import Tuple
import fitz  # pymupdf

async def process_document(
    content: str,
    content_type: str,
    filename: str
) -> Tuple[str, int]:
    """
    Process uploaded document and extract text content.
    
    Args:
        content: Base64 encoded content for PDF, plain text for TXT
        content_type: MIME type of the document
        filename: Original filename
    
    Returns:
        Tuple of (extracted_text, size_in_bytes)
    """
    print(f"[DEBUG] Processing document: {filename}")
    print(f"[DEBUG] Content type: {content_type}")
    print(f"[DEBUG] Content length: {len(content)} chars")
    
    try:
        if content_type == "application/pdf":
            print("[DEBUG] Processing as PDF...")
            # Decode base64 PDF content
            pdf_bytes = base64.b64decode(content)
            print(f"[DEBUG] Decoded PDF bytes: {len(pdf_bytes)}")
            
            # Extract text from PDF using PyMuPDF
            print("[DEBUG] Extracting text from PDF...")
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            text_content = ""
            
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                page_text = page.get_text()
                text_content += page_text + "\n"
                print(f"[DEBUG] Extracted text from page {page_num+1}: {len(page_text)} chars")
            
            doc.close()
            text_content = text_content.strip()
            print(f"[DEBUG] Total extracted text: {len(text_content)} chars")
            return text_content, len(pdf_bytes)
        
        elif content_type == "text/plain" or filename.endswith(".txt"):
            print("[DEBUG] Processing as plain text...")
            # Plain text content
            text_content = content
            size = len(content.encode("utf-8"))
            print(f"[DEBUG] Text processed: {len(text_content)} chars, {size} bytes")
            return text_content, size
        
        else:
            print(f"[DEBUG] Unsupported content type: {content_type}")
            raise ValueError(f"Unsupported content type: {content_type}")
            
    except Exception as e:
        print(f"[DEBUG] Error processing document: {str(e)}")
        import traceback
        traceback.print_exc()
        raise
