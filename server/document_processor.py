"""Document processing utilities for PDF and TXT files."""
import base64
import io
from typing import Tuple
from PyPDF2 import PdfReader

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
    if content_type == "application/pdf":
        # Decode base64 PDF content
        pdf_bytes = base64.b64decode(content)
        pdf_file = io.BytesIO(pdf_bytes)
        
        # Extract text from PDF
        reader = PdfReader(pdf_file)
        text_content = ""
        for page in reader.pages:
            text_content += page.extract_text() + "\n"
        
        return text_content.strip(), len(pdf_bytes)
    
    elif content_type == "text/plain" or filename.endswith(".txt"):
        # Plain text content
        text_content = content
        return text_content, len(content.encode("utf-8"))
    
    else:
        raise ValueError(f"Unsupported content type: {content_type}")
