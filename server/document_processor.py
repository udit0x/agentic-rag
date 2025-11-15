"""Enhanced document processing pipeline supporting multiple file types."""
import base64
import io
import logging
from typing import Tuple, Dict, Any
import fitz  # pymupdf

# Handle relative import for when used as module vs direct execution
try:
    from .ocr_processor import ocr_processor
    from .universal_document_processor import process_document as universal_process_document
except ImportError:
    from ocr_processor import ocr_processor
    from universal_document_processor import process_document as universal_process_document

logger = logging.getLogger(__name__)

async def process_document(
    content: str,
    content_type: str,
    filename: str,
    force_ocr: bool = False
) -> Tuple[str, int, Dict[str, Any]]:
    """
    Enhanced document processing pipeline supporting multiple file types.
    
    This function now routes to the universal document processor for all file types,
    maintaining backward compatibility for PDF and TXT while adding support for:
    - Microsoft Office documents (DOCX, PPTX)
    - Spreadsheets (CSV, XLSX)
    - Data formats (JSON)
    - Markup (Markdown, HTML)
    
    Args:
        content: Base64 encoded content for binary files, plain text for text files
        content_type: MIME type of the document
        filename: Original filename
        force_ocr: If True, forces OCR processing for PDFs
    
    Returns:
        Tuple of (extracted_text, size_in_bytes, processing_metrics)
    """
    logger.info("Processing document: %s (type: %s, force_ocr: %s)", filename, content_type, force_ocr)
    
    # Handle plain text files directly (legacy support)
    if content_type == "text/plain" or filename.endswith(".txt"):
        logger.debug("Handling as legacy plain text: %s", filename)
        text_content = content
        size = len(content.encode("utf-8"))
        processing_metrics = {
            "filename": filename,
            "content_type": content_type,
            "file_type": "txt",
            "extraction_mode": "Direct",
            "total_chars": len(text_content),
            "processing_time_ms": 0,
            "errors": []
        }
        return text_content, size, processing_metrics
    
    # For all other file types, route to universal processor
    try:
        return await universal_process_document(
            content=content,
            content_type=content_type,
            filename=filename,
            force_ocr=force_ocr
        )
    except Exception as e:
        logger.error("Universal processor failed for %s: %s", filename, str(e))
        # For backward compatibility, try legacy PDF processing if it's a PDF
        if content_type == "application/pdf":
            logger.info("Falling back to legacy PDF processing for %s", filename)
            return await _legacy_pdf_processing(content, content_type, filename, force_ocr)
        else:
            # Re-raise for non-PDF files
            raise


async def _legacy_pdf_processing(
    content: str,
    content_type: str,
    filename: str,
    force_ocr: bool = False
) -> Tuple[str, int, Dict[str, Any]]:
    """
    Legacy PDF processing function for fallback compatibility.
    
    This is the original PDF processing logic, kept for emergency fallback
    if the universal processor encounters issues.
    """
    logger.warning("Using legacy PDF processing fallback for %s", filename)
    
    processing_metrics = {
        "filename": filename,
        "content_type": content_type,
        "file_type": "pdf",
        "extraction_mode": "Direct",
        "ocr_triggered": False,
        "processing_time_ms": 0,
        "page_count": 0,
        "total_chars": 0,
        "ocr_method": None,
        "errors": ["Used legacy PDF fallback processor"]
    }
    
    try:
        # Decode base64 PDF content
        pdf_bytes = base64.b64decode(content)
        
        # Extract text from PDF using PyMuPDF
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        text_content = ""
        processing_metrics["page_count"] = len(doc)
        
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            page_text = page.get_text()
            text_content += page_text + "\n"
        
        doc.close()
        text_content = text_content.strip()
        processing_metrics["total_chars"] = len(text_content)
        
        # Check if OCR is needed
        ocr_needed = force_ocr or not ocr_processor.is_text_content_sufficient(text_content)
        
        if ocr_needed:
            processing_metrics["ocr_triggered"] = True
            processing_metrics["extraction_mode"] = "OCR"
            
            try:
                ocr_text, ocr_metrics = await ocr_processor.process_scanned_document(
                    pdf_bytes, filename
                )
                
                if ocr_text and len(ocr_text.strip()) > 0:
                    text_content = ocr_text
                    processing_metrics.update(ocr_metrics.finalize())
                else:
                    error_msg = "OCR extraction yielded no meaningful content"
                    processing_metrics["errors"].append(error_msg)
                    logger.warning("OCR extraction failed for %s: no content", filename)
                    
            except Exception as ocr_error:
                error_msg = f"OCR failed: {str(ocr_error)}"
                processing_metrics["errors"].append(error_msg)
                logger.error("OCR processing failed for %s: %s", filename, str(ocr_error))
        
        return text_content, len(pdf_bytes), processing_metrics
        
    except Exception as e:
        error_msg = f"Legacy PDF processing error: {str(e)}"
        processing_metrics["errors"].append(error_msg)
        logger.error("Legacy PDF processing failed for %s: %s", filename, str(e))
        import traceback
        logger.debug("Traceback: %s", traceback.format_exc())
        raise
