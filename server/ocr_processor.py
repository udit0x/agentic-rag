"""OCR processing utilities for scanned documents."""
import os
import base64
import io
import asyncio
from typing import Tuple, Dict, Any, Optional
from datetime import datetime
import fitz  # pymupdf
from PIL import Image

class ProcessingMetrics:
    """Track document processing metrics."""
    
    def __init__(self):
        self.start_time = datetime.now()
        self.extraction_mode = "unknown"
        self.page_count = 0
        self.total_chars = 0
        self.processing_time_ms = 0
        self.ocr_method = None
        self.errors = []
    
    def finalize(self) -> Dict[str, Any]:
        """Finalize metrics and return as dictionary."""
        self.processing_time_ms = int((datetime.now() - self.start_time).total_seconds() * 1000)
        
        return {
            "extraction_mode": self.extraction_mode,
            "page_count": self.page_count,
            "total_chars": self.total_chars,
            "processing_time_ms": self.processing_time_ms,
            "ocr_method": self.ocr_method,
            "errors": self.errors,
            "chars_per_page": self.total_chars / max(self.page_count, 1),
            "ms_per_page": self.processing_time_ms / max(self.page_count, 1)
        }

class OCRProcessor:
    """OCR processing with Azure Document Intelligence and Tesseract fallback."""
    
    def __init__(self):
        # Azure Document Intelligence configuration
        self.azure_endpoint = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
        self.azure_key = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY")
        self.azure_available = bool(self.azure_endpoint and self.azure_key)
        
        print(f"[OCR] Azure Document Intelligence available: {self.azure_available}")
        if self.azure_available:
            print(f"[OCR] Endpoint configured: {bool(self.azure_endpoint)}")
            print(f"[OCR] Key configured: {bool(self.azure_key)}")
    
    def is_text_content_sufficient(self, text: str, min_chars: int = 100) -> bool:
        """
        Advanced text quality analysis to determine if OCR is needed.
        
        This function uses multiple heuristics to detect poor-quality text extraction
        that commonly occurs with scanned PDFs, even when some text is present.
        
        Args:
            text: Extracted text content
            min_chars: Minimum character threshold for sufficient content
            
        Returns:
            True if content is sufficient, False if OCR is needed
        """
        if not text:
            return False
        
        # Clean text and check meaningful content
        cleaned_text = text.strip()
        
        # Enhanced noise indicators for academic/courseware content
        noise_indicators = [
            "created by", "producer:", "creator:", "title:", "subject:",
            "keywords:", "moddate:", "creationdate:", "pages:", "encrypted:",
            "pdf", "adobe", "acrobat", "version", "linearized", "xref",
            "courseware materials", "copyright", "permission", "associates",
            "practitioner's approach", "provided with permission"
        ]
        
        # Remove lines that are likely metadata or poor extraction artifacts
        lines = cleaned_text.split('\n')
        meaningful_lines = []
        word_count = 0
        total_word_length = 0
        suspicious_patterns = 0
        repetitive_content = {}
        
        for line in lines:
            line_lower = line.lower().strip()
            if len(line_lower) < 3:  # Skip very short lines
                continue
            
            # Skip lines that are primarily metadata
            is_noise = any(indicator in line_lower for indicator in noise_indicators)
            if is_noise:
                continue
            
            # Check for suspicious patterns that indicate poor OCR extraction
            words = line_lower.split()
            if not words:
                continue
                
            # Count suspicious single-character "words" (common in poor extraction)
            single_chars = sum(1 for word in words if len(word) == 1 and word.isalpha())
            if single_chars > len(words) * 0.3:  # More than 30% single characters
                suspicious_patterns += 1
                print(f"[OCR] Suspicious line (many single chars): '{line[:50]}...'")
                continue
            
            # Check for excessive special characters (garbled text)
            special_char_ratio = sum(1 for c in line if not c.isalnum() and c not in ' \t\n.,!?;:-()[]{}') / max(len(line), 1)
            if special_char_ratio > 0.2:  # More than 20% special characters
                suspicious_patterns += 1
                print(f"[OCR] Suspicious line (special chars): '{line[:50]}...'")
                continue
            
            # Check for excessive numbers without context (like page numbers, dates without text)
            digit_ratio = sum(1 for c in line if c.isdigit()) / max(len(line), 1)
            if digit_ratio > 0.5 and len(words) < 3:  # Mostly numbers in short lines
                suspicious_patterns += 1
                print(f"[OCR] Suspicious line (mostly numbers): '{line[:50]}...'")
                continue
            
            # Track repetitive content (common in scanned courseware/academic materials)
            line_normalized = ' '.join(words[:10])  # First 10 words for pattern matching
            if len(line_normalized) > 20:  # Only track substantial lines
                repetitive_content[line_normalized] = repetitive_content.get(line_normalized, 0) + 1
            
            # This line seems legitimate
            meaningful_lines.append(line)
            word_count += len(words)
            total_word_length += sum(len(word) for word in words)
        
        meaningful_text = '\n'.join(meaningful_lines).strip()
        char_count = len(meaningful_text)
        
        # Calculate repetition ratio (high repetition suggests scanned academic content)
        total_repetitions = sum(count - 1 for count in repetitive_content.values() if count > 1)
        repetition_ratio = total_repetitions / max(len(meaningful_lines), 1)
        
        # Find the most repetitive content
        most_repeated = max(repetitive_content.items(), key=lambda x: x[1], default=("", 0))
        max_repetitions = most_repeated[1]
        
        # Advanced quality metrics
        avg_word_length = total_word_length / max(word_count, 1)
        lines_ratio = len(meaningful_lines) / max(len(lines), 1)
        unique_content_ratio = len(set(meaningful_lines)) / max(len(meaningful_lines), 1)
        
        # Enhanced decision logic with repetition detection
        quality_checks = {
            "char_count": char_count >= min_chars,
            "word_count": word_count >= 25,  # At least 25 words (increased from 20)
            "avg_word_length": avg_word_length >= 3,  # Average word length >= 3 chars
            "lines_ratio": lines_ratio >= 0.4,  # At least 40% of lines are meaningful (increased from 30%)
            "low_suspicious": suspicious_patterns <= len(lines) * 0.15,  # Less than 15% suspicious lines (stricter)
            "low_repetition": repetition_ratio < 0.3,  # Less than 30% repetitive content (stricter)
            "content_diversity": unique_content_ratio >= 0.8,  # At least 80% unique lines (stricter)
            "max_reps_reasonable": max_repetitions <= 2  # No line repeated more than 2 times (stricter)
        }
        
        # For scanned academic/courseware content, be more strict
        if max_repetitions >= 2 or repetition_ratio > 0.25:
            print(f"[OCR] High repetition detected - likely scanned courseware/academic content")
            print(f"  Most repeated: '{most_repeated[0][:50]}...' ({max_repetitions} times)")
            print(f"  Repetition ratio: {repetition_ratio:.2f}")
            
        passed_checks = sum(quality_checks.values())
        # Need to pass at least 6 out of 8 checks (more strict for repetitive content)
        is_sufficient = passed_checks >= 6
        
        print(f"[OCR] Advanced text analysis:")
        print(f"  Raw: {len(text)} chars, {len(lines)} lines")
        print(f"  Meaningful: {char_count} chars, {len(meaningful_lines)} lines, {word_count} words")
        print(f"  Avg word length: {avg_word_length:.1f}, Suspicious patterns: {suspicious_patterns}")
        print(f"  Repetition ratio: {repetition_ratio:.2f}, Max repetitions: {max_repetitions}")
        print(f"  Unique content ratio: {unique_content_ratio:.2f}")
        print(f"  Quality checks: {quality_checks}")
        print(f"  Decision: {'✅ Sufficient' if is_sufficient else '❌ Needs OCR'} ({passed_checks}/8 checks passed)")
        
        return is_sufficient
    
    async def run_azure_ocr(self, pdf_bytes: bytes) -> Tuple[str, Dict[str, Any]]:
        """
        Run OCR using Azure Document Intelligence.
        
        Args:
            pdf_bytes: PDF file content as bytes
            
        Returns:
            Tuple of (extracted_text, metadata)
        """
        try:
            from azure.ai.formrecognizer import DocumentAnalysisClient
            from azure.core.credentials import AzureKeyCredential
            
            print("[OCR] Starting Azure Document Intelligence processing...")
            
            client = DocumentAnalysisClient(
                endpoint=self.azure_endpoint,
                credential=AzureKeyCredential(self.azure_key)
            )
            
            # Analyze document using "prebuilt-read" model
            poller = client.begin_analyze_document(
                "prebuilt-read", 
                document=io.BytesIO(pdf_bytes)
            )
            result = poller.result()
            
            # Extract text from all pages
            pages_text = []
            total_lines = 0
            
            for page_idx, page in enumerate(result.pages):
                page_lines = []
                for line in page.lines:
                    page_lines.append(line.content)
                    total_lines += 1
                
                page_text = "\n".join(page_lines)
                pages_text.append(page_text)
                
                print(f"[OCR] Azure - Page {page_idx + 1}: {len(page_lines)} lines, {len(page_text)} chars")
            
            full_text = "\n\n".join(pages_text)
            
            metadata = {
                "pages_processed": len(result.pages),
                "total_lines": total_lines,
                "method": "azure_document_intelligence",
                "model": "prebuilt-read"
            }
            
            print(f"[OCR] Azure Document Intelligence completed: {len(full_text)} chars from {len(result.pages)} pages")
            return full_text, metadata
            
        except ImportError as e:
            print(f"[OCR] Azure Document Intelligence library not available: {e}")
            raise Exception("azure-ai-formrecognizer not installed")
        except Exception as e:
            print(f"[OCR] Azure Document Intelligence failed: {e}")
            raise Exception(f"Azure OCR failed: {str(e)}")
    
    async def run_tesseract_ocr(self, pdf_bytes: bytes) -> Tuple[str, Dict[str, Any]]:
        """
        Run OCR using Tesseract as fallback.
        
        Args:
            pdf_bytes: PDF file content as bytes
            
        Returns:
            Tuple of (extracted_text, metadata)
        """
        try:
            import pytesseract
            
            print("[OCR] Starting Tesseract OCR processing...")
            
            # Open PDF and convert pages to images
            pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            pages_text = []
            total_confidence = 0
            confidence_count = 0
            
            for page_num in range(len(pdf_doc)):
                print(f"[OCR] Tesseract - Processing page {page_num + 1}/{len(pdf_doc)}")
                
                page = pdf_doc.load_page(page_num)
                
                # Convert page to image
                # Higher DPI for better OCR accuracy
                pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))  # 2x scaling for better quality
                img_data = pix.tobytes("png")
                img = Image.open(io.BytesIO(img_data))
                
                # Run OCR with configuration for better accuracy
                try:
                    # Get text with confidence data
                    ocr_data = pytesseract.image_to_data(
                        img, 
                        config='--psm 6 --oem 3 -l eng',  # Page segmentation mode 6, OCR Engine Mode 3
                        output_type=pytesseract.Output.DICT
                    )
                    
                    # Extract text and calculate average confidence
                    page_text_parts = []
                    page_confidences = []
                    
                    for i, conf in enumerate(ocr_data['conf']):
                        if int(conf) > 30:  # Only include text with reasonable confidence
                            text = ocr_data['text'][i].strip()
                            if text:
                                page_text_parts.append(text)
                                page_confidences.append(int(conf))
                    
                    page_text = ' '.join(page_text_parts)
                    
                    if page_confidences:
                        avg_confidence = sum(page_confidences) / len(page_confidences)
                        total_confidence += avg_confidence
                        confidence_count += 1
                        print(f"[OCR] Tesseract - Page {page_num + 1}: {len(page_text)} chars, avg confidence: {avg_confidence:.1f}%")
                    else:
                        print(f"[OCR] Tesseract - Page {page_num + 1}: No reliable text found")
                    
                    pages_text.append(page_text)
                    
                except Exception as page_error:
                    print(f"[OCR] Tesseract - Error on page {page_num + 1}: {page_error}")
                    pages_text.append("")  # Add empty page to maintain page count
            
            pdf_doc.close()
            
            full_text = "\n\n".join(pages_text)
            
            metadata = {
                "pages_processed": len(pages_text),
                "method": "tesseract",
                "average_confidence": total_confidence / max(confidence_count, 1),
                "config": "--psm 6 --oem 3 -l eng"
            }
            
            print(f"[OCR] Tesseract completed: {len(full_text)} chars from {len(pages_text)} pages")
            return full_text, metadata
            
        except ImportError as e:
            print(f"[OCR] Tesseract library not available: {e}")
            raise Exception("pytesseract not installed")
        except Exception as e:
            print(f"[OCR] Tesseract OCR failed: {e}")
            raise Exception(f"Tesseract OCR failed: {str(e)}")
    
    async def process_scanned_document(
        self, 
        pdf_bytes: bytes, 
        filename: str
    ) -> Tuple[str, ProcessingMetrics]:
        """
        Process a scanned document using OCR.
        
        Args:
            pdf_bytes: PDF file content as bytes
            filename: Original filename for logging
            
        Returns:
            Tuple of (extracted_text, processing_metrics)
        """
        metrics = ProcessingMetrics()
        metrics.extraction_mode = "OCR"
        
        # Get page count for metrics
        try:
            pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            metrics.page_count = len(pdf_doc)
            pdf_doc.close()
            print(f"[OCR] Document '{filename}' has {metrics.page_count} pages")
        except Exception as e:
            print(f"[OCR] Could not determine page count: {e}")
            metrics.page_count = 1
        
        # Try Azure Document Intelligence first
        if self.azure_available:
            try:
                text, ocr_metadata = await self.run_azure_ocr(pdf_bytes)
                metrics.ocr_method = "azure_document_intelligence"
                metrics.total_chars = len(text)
                
                print(f"[OCR] Successfully processed '{filename}' with Azure Document Intelligence")
                return text, metrics
                
            except Exception as e:
                print(f"[OCR] Azure Document Intelligence failed for '{filename}': {e}")
                metrics.errors.append(f"Azure failed: {str(e)}")
        
        # Fallback to Tesseract
        try:
            text, ocr_metadata = await self.run_tesseract_ocr(pdf_bytes)
            metrics.ocr_method = "tesseract"
            metrics.total_chars = len(text)
            
            print(f"[OCR] Successfully processed '{filename}' with Tesseract fallback")
            return text, metrics
            
        except Exception as e:
            print(f"[OCR] Tesseract also failed for '{filename}': {e}")
            metrics.errors.append(f"Tesseract failed: {str(e)}")
            
            # If both methods fail, return empty text with error metrics
            metrics.ocr_method = "failed"
            metrics.total_chars = 0
            
            error_msg = f"OCR processing failed for '{filename}'. Both Azure Document Intelligence and Tesseract failed."
            print(f"[OCR] {error_msg}")
            
            return "", metrics

# Global OCR processor instance
ocr_processor = OCRProcessor()