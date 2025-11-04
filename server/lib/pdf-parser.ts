import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

// Create require function for CommonJS modules in ESM
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

/**
 * Extract text content from PDF buffer or base64 string
 */
export async function extractPdfText(input: Buffer | string): Promise<string> {
  try {
    let buffer: Buffer;
    
    if (typeof input === 'string') {
      // Handle base64 encoded PDF
      if (input.startsWith('data:application/pdf;base64,')) {
        buffer = Buffer.from(input.split(',')[1], 'base64');
      } else if (input.startsWith('JVBERi')) {
        // Direct base64 PDF content (starts with PDF header in base64)
        buffer = Buffer.from(input, 'base64');
      } else {
        throw new Error('Invalid PDF string format');
      }
    } else {
      buffer = input;
    }
    
    // Parse PDF and extract text using pdf-parse
    const data = await pdf(buffer);
    
    console.log(`[PDF-PARSER] Extracted ${data.text.length} characters from PDF`);
    console.log(`[PDF-PARSER] PDF metadata:`, {
      numpages: data.numpages,
      title: data.info?.Title,
      author: data.info?.Author,
      subject: data.info?.Subject,
    });
    
    return data.text || '';
  } catch (error) {
    console.error('[PDF-PARSER] Error extracting PDF text:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if content is a PDF based on magic bytes or base64 header
 */
export function isPdfContent(content: string): boolean {
  // Check for PDF magic bytes in base64 (JVBERi = "%PDF-" in base64)
  if (content.startsWith('JVBERi')) return true;
  
  // Check for data URL with PDF
  if (content.startsWith('data:application/pdf;base64,')) return true;
  
  // Check for raw PDF magic bytes
  if (content.startsWith('%PDF-')) return true;
  
  return false;
}

/**
 * Detect content type from file content
 */
export function detectContentType(filename: string, content: string): string {
  const ext = path.extname(filename).toLowerCase();
  
  // Check file extension first
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.txt') return 'text/plain';
  if (ext === '.md') return 'text/markdown';
  if (ext === '.json') return 'application/json';
  if (ext === '.html' || ext === '.htm') return 'text/html';
  if (ext === '.xml') return 'application/xml';
  
  // Check content if extension is unclear
  if (isPdfContent(content)) return 'application/pdf';
  
  // Default to text/plain
  return 'text/plain';
}