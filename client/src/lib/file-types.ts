/**
 * Supported file types and their configurations for the multi-document upload system.
 */

export interface SupportedFileType {
  extension: string;
  mimeTypes: string[];
  displayName: string;
  description: string;
  category: 'document' | 'spreadsheet' | 'presentation' | 'data' | 'text';
  icon: string; // For future UI enhancement
  maxSize?: number; // Custom size limit if different from default
  processingNotes?: string;
}

export const SUPPORTED_FILE_TYPES: SupportedFileType[] = [
  {
    extension: '.pdf',
    mimeTypes: ['application/pdf'],
    displayName: 'PDF',
    description: 'Portable Document Format with OCR support for scanned documents',
    category: 'document',
    icon: 'file-text',
    processingNotes: 'Supports both digital and scanned PDFs with OCR fallback'
  },
  {
    extension: '.docx',
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ],
    displayName: 'Word Document',
    description: 'Microsoft Word documents (.docx, .doc)',
    category: 'document',
    icon: 'file-text',
    processingNotes: 'Extracts text content, formatting, and embedded tables'
  },
  {
    extension: '.pptx',
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint'
    ],
    displayName: 'PowerPoint',
    description: 'Microsoft PowerPoint presentations (.pptx, .ppt)',
    category: 'presentation',
    icon: 'presentation',
    processingNotes: 'Extracts slide text content and speaker notes'
  },
  {
    extension: '.xlsx',
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ],
    displayName: 'Excel Spreadsheet',
    description: 'Microsoft Excel spreadsheets (.xlsx, .xls)',
    category: 'spreadsheet',
    icon: 'table',
    processingNotes: 'Processes all sheets with data truncation for large files'
  },
  {
    extension: '.csv',
    mimeTypes: ['text/csv', 'application/csv'],
    displayName: 'CSV',
    description: 'Comma-separated values files',
    category: 'data',
    icon: 'table',
    processingNotes: 'Handles large datasets with automatic row limiting'
  },
  {
    extension: '.json',
    mimeTypes: ['application/json', 'text/json'],
    displayName: 'JSON',
    description: 'JavaScript Object Notation data files',
    category: 'data',
    icon: 'code',
    processingNotes: 'Pretty-prints JSON with size limits for large files'
  },
  {
    extension: '.md',
    mimeTypes: ['text/markdown', 'text/x-markdown'],
    displayName: 'Markdown',
    description: 'Markdown markup files (.md, .markdown)',
    category: 'text',
    icon: 'file-text',
    processingNotes: 'Preserves markdown structure and formatting'
  },
  {
    extension: '.html',
    mimeTypes: ['text/html'],
    displayName: 'HTML',
    description: 'HyperText Markup Language files',
    category: 'text',
    icon: 'code',
    processingNotes: 'Extracts text content while removing HTML tags'
  },
  {
    extension: '.txt',
    mimeTypes: ['text/plain'],
    displayName: 'Text',
    description: 'Plain text files',
    category: 'text',
    icon: 'file-text',
    processingNotes: 'Direct text processing with encoding detection'
  }
];

/**
 * Get all supported file extensions as a comma-separated string
 */
export function getSupportedExtensions(): string {
  return SUPPORTED_FILE_TYPES.map(type => type.extension).join(',');
}

/**
 * Get all supported MIME types
 */
export function getSupportedMimeTypes(): string[] {
  return SUPPORTED_FILE_TYPES.flatMap(type => type.mimeTypes);
}

/**
 * Get file type info by extension
 */
export function getFileTypeInfo(extension: string): SupportedFileType | undefined {
  return SUPPORTED_FILE_TYPES.find(
    type => type.extension.toLowerCase() === extension.toLowerCase()
  );
}

/**
 * Get file type info by MIME type
 */
export function getFileTypeInfoByMime(mimeType: string): SupportedFileType | undefined {
  return SUPPORTED_FILE_TYPES.find(
    type => type.mimeTypes.some(mime => mime.toLowerCase() === mimeType.toLowerCase())
  );
}

/**
 * Check if a file type is supported
 */
export function isFileTypeSupported(extension: string): boolean {
  return getFileTypeInfo(extension) !== undefined;
}

/**
 * Get grouped file types by category
 */
export function getFileTypesByCategory(): Record<string, SupportedFileType[]> {
  return SUPPORTED_FILE_TYPES.reduce((acc, fileType) => {
    if (!acc[fileType.category]) {
      acc[fileType.category] = [];
    }
    acc[fileType.category].push(fileType);
    return acc;
  }, {} as Record<string, SupportedFileType[]>);
}

/**
 * Format file size limit for display
 */
export function formatSizeLimit(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${Math.round(mb)}MB` : `${Math.round(bytes / 1024)}KB`;
}

/**
 * Default configuration for document upload
 */
export const UPLOAD_CONFIG = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  supportedExtensions: getSupportedExtensions(),
  supportedMimeTypes: getSupportedMimeTypes(),
  maxFilesPerUpload: 10,
  chunkSizeForLargeFiles: 1000 * 1000, // 1MB chunks for processing
} as const;