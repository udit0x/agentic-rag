export interface DocumentChunk {
  index: number;
  content: string;
  startPos: number;
  endPos: number;
  metadata: {
    chunkSize: number;
    wordCount: number;
    sentenceCount?: number;
    paragraphIndex?: number;
    section?: string;
    [key: string]: any;
  };
}

export interface ChunkingOptions {
  chunkSize: number;
  chunkOverlap: number;
  separators: string[];
  preserveParagraphs: boolean;
  minChunkSize: number;
  maxChunkSize: number;
}

export class ChunkingService {
  private static readonly DEFAULT_OPTIONS: ChunkingOptions = {
    chunkSize: 1000,
    chunkOverlap: 200,
    separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' '],
    preserveParagraphs: true,
    minChunkSize: 100,
    maxChunkSize: 2000
  };

  /**
   * Chunk a document into smaller pieces with intelligent splitting
   */
  static chunkDocument(content: string, options: Partial<ChunkingOptions> = {}): DocumentChunk[] {
    const opts = { ...ChunkingService.DEFAULT_OPTIONS, ...options };
    
    console.log(`[CHUNKING] Starting document chunking with options:`, {
      chunkSize: opts.chunkSize,
      chunkOverlap: opts.chunkOverlap,
      separators: opts.separators.length,
      contentLength: content.length
    });

    if (!content || content.trim().length === 0) {
      console.warn('[CHUNKING] Empty content provided');
      return [];
    }

    // Preprocess content
    const cleanedContent = ChunkingService.preprocessContent(content);
    
    // Split into paragraphs first if preserveParagraphs is enabled
    if (opts.preserveParagraphs) {
      return ChunkingService.chunkByParagraphs(cleanedContent, opts);
    } else {
      return ChunkingService.chunkBySize(cleanedContent, opts);
    }
  }

  /**
   * Preprocess content to clean and normalize text
   */
  private static preprocessContent(content: string): string {
    return content
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove excessive whitespace
      .replace(/[ \t]+/g, ' ')
      // Normalize multiple newlines but preserve paragraph breaks
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Chunk by preserving paragraph structure
   */
  private static chunkByParagraphs(content: string, options: ChunkingOptions): DocumentChunk[] {
    const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0);
    const chunks: DocumentChunk[] = [];
    
    let currentChunk = '';
    let currentPos = 0;
    let chunkIndex = 0;
    let paragraphIndex = 0;

    for (const paragraph of paragraphs) {
      const trimmedParagraph = paragraph.trim();
      
      // If adding this paragraph would exceed chunk size, finalize current chunk
      if (currentChunk.length > 0 && 
          currentChunk.length + trimmedParagraph.length + 2 > options.chunkSize) {
        
        // Create chunk from current content
        const chunk = ChunkingService.createChunk(
          currentChunk.trim(),
          chunkIndex++,
          currentPos - currentChunk.length,
          currentPos,
          { paragraphIndex: paragraphIndex - 1 }
        );
        chunks.push(chunk);

        // Start new chunk with overlap
        const overlapText = ChunkingService.extractOverlap(currentChunk, options.chunkOverlap);
        currentChunk = overlapText.length > 0 ? overlapText + '\n\n' + trimmedParagraph : trimmedParagraph;
        currentPos += currentChunk.length;
      } else {
        // Add paragraph to current chunk
        if (currentChunk.length > 0) {
          currentChunk += '\n\n' + trimmedParagraph;
        } else {
          currentChunk = trimmedParagraph;
        }
        currentPos += trimmedParagraph.length + (currentChunk !== trimmedParagraph ? 2 : 0);
      }
      
      paragraphIndex++;
    }

    // Add final chunk if there's remaining content
    if (currentChunk.trim().length >= options.minChunkSize) {
      const chunk = ChunkingService.createChunk(
        currentChunk.trim(),
        chunkIndex,
        currentPos - currentChunk.length,
        currentPos,
        { paragraphIndex: paragraphIndex - 1 }
      );
      chunks.push(chunk);
    }

    console.log(`[CHUNKING] Created ${chunks.length} chunks from ${paragraphs.length} paragraphs`);
    return chunks;
  }

  /**
   * Chunk by size with intelligent splitting
   */
  private static chunkBySize(content: string, options: ChunkingOptions): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let currentPos = 0;
    let chunkIndex = 0;

    while (currentPos < content.length) {
      const endPos = Math.min(currentPos + options.chunkSize, content.length);
      let chunkContent = content.substring(currentPos, endPos);

      // If not at the end of content, try to find a good break point
      if (endPos < content.length) {
        const betterBreakPoint = ChunkingService.findBestBreakPoint(
          chunkContent, 
          content.substring(endPos, Math.min(endPos + 200, content.length)),
          options.separators
        );
        
        if (betterBreakPoint > 0) {
          chunkContent = chunkContent.substring(0, betterBreakPoint);
        }
      }

      // Only create chunk if it meets minimum size requirement
      if (chunkContent.trim().length >= options.minChunkSize) {
        const chunk = ChunkingService.createChunk(
          chunkContent.trim(),
          chunkIndex++,
          currentPos,
          currentPos + chunkContent.length
        );
        chunks.push(chunk);
      }

      // Move to next position with overlap
      const actualChunkLength = chunkContent.length;
      currentPos += Math.max(actualChunkLength - options.chunkOverlap, 1);
    }

    console.log(`[CHUNKING] Created ${chunks.length} chunks using size-based splitting`);
    return chunks;
  }

  /**
   * Find the best break point using separators
   */
  private static findBestBreakPoint(chunkContent: string, nextContent: string, separators: string[]): number {
    for (const separator of separators) {
      // Look for separator near the end of the chunk (in last 30% of content)
      const searchStart = Math.floor(chunkContent.length * 0.7);
      const lastIndex = chunkContent.lastIndexOf(separator, chunkContent.length);
      
      if (lastIndex > searchStart) {
        return lastIndex + separator.length;
      }
    }
    
    return -1; // No good break point found
  }

  /**
   * Extract overlap text from the end of a chunk
   */
  private static extractOverlap(chunkContent: string, overlapSize: number): string {
    if (overlapSize <= 0 || chunkContent.length <= overlapSize) {
      return '';
    }

    const overlapText = chunkContent.substring(chunkContent.length - overlapSize);
    
    // Try to start overlap at a sentence boundary
    const sentenceStart = overlapText.search(/[.!?]\s+/);
    if (sentenceStart > 0) {
      return overlapText.substring(sentenceStart + 2); // Skip the punctuation and space
    }
    
    return overlapText;
  }

  /**
   * Create a document chunk with metadata
   */
  private static createChunk(
    content: string, 
    index: number, 
    startPos: number, 
    endPos: number,
    additionalMetadata: Record<string, any> = {}
  ): DocumentChunk {
    const words = content.split(/\s+/).filter(w => w.length > 0);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    return {
      index,
      content,
      startPos,
      endPos,
      metadata: {
        chunkSize: content.length,
        wordCount: words.length,
        sentenceCount: sentences.length,
        ...additionalMetadata
      }
    };
  }

  /**
   * Analyze document structure to recommend chunking strategy
   */
  static analyzeDocumentStructure(content: string): {
    recommendedStrategy: 'paragraph' | 'size';
    estimatedChunks: number;
    averageParagraphLength: number;
    totalParagraphs: number;
    recommendations: string[];
  } {
    const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0);
    const totalLength = content.length;
    const averageParagraphLength = paragraphs.length > 0 ? totalLength / paragraphs.length : 0;
    
    const recommendations: string[] = [];
    let recommendedStrategy: 'paragraph' | 'size' = 'paragraph';

    // Analyze paragraph structure
    if (paragraphs.length > 0) {
      const shortParagraphs = paragraphs.filter(p => p.length < 200).length;
      const longParagraphs = paragraphs.filter(p => p.length > 1500).length;
      
      if (shortParagraphs / paragraphs.length > 0.7) {
        recommendations.push('Many short paragraphs detected. Consider increasing chunk size.');
      }
      
      if (longParagraphs > 0) {
        recommendations.push('Some very long paragraphs detected. Size-based chunking may be better.');
        recommendedStrategy = 'size';
      }
      
      if (averageParagraphLength > 800) {
        recommendations.push('Large average paragraph size. Consider size-based chunking.');
        recommendedStrategy = 'size';
      }
    } else {
      recommendations.push('No clear paragraph structure. Using size-based chunking.');
      recommendedStrategy = 'size';
    }

    const estimatedChunks = Math.ceil(totalLength / 1000); // Rough estimate with 1000 char chunks

    return {
      recommendedStrategy,
      estimatedChunks,
      averageParagraphLength,
      totalParagraphs: paragraphs.length,
      recommendations
    };
  }

  /**
   * Create chunks optimized for embeddings
   */
  static createEmbeddingOptimizedChunks(content: string): DocumentChunk[] {
    const analysis = ChunkingService.analyzeDocumentStructure(content);
    
    console.log('[CHUNKING] Document analysis:', analysis);
    
    // Use analysis to determine optimal settings
    const options: ChunkingOptions = {
      chunkSize: analysis.averageParagraphLength > 800 ? 800 : 1000,
      chunkOverlap: analysis.averageParagraphLength > 800 ? 100 : 200,
      separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' '],
      preserveParagraphs: analysis.recommendedStrategy === 'paragraph',
      minChunkSize: 50,
      maxChunkSize: 1500
    };

    return ChunkingService.chunkDocument(content, options);
  }

  /**
   * Validate chunk quality
   */
  static validateChunks(chunks: DocumentChunk[]): {
    isValid: boolean;
    issues: string[];
    statistics: {
      totalChunks: number;
      averageSize: number;
      minSize: number;
      maxSize: number;
      totalContent: number;
    };
  } {
    const issues: string[] = [];
    
    if (chunks.length === 0) {
      issues.push('No chunks created');
      return {
        isValid: false,
        issues,
        statistics: {
          totalChunks: 0,
          averageSize: 0,
          minSize: 0,
          maxSize: 0,
          totalContent: 0
        }
      };
    }

    const sizes = chunks.map(c => c.content.length);
    const totalContent = sizes.reduce((sum, size) => sum + size, 0);
    const averageSize = totalContent / chunks.length;
    const minSize = Math.min(...sizes);
    const maxSize = Math.max(...sizes);

    // Check for issues
    if (minSize < 50) {
      issues.push(`Some chunks are very small (min: ${minSize} characters)`);
    }
    
    if (maxSize > 2000) {
      issues.push(`Some chunks are very large (max: ${maxSize} characters)`);
    }
    
    if (averageSize < 200) {
      issues.push('Average chunk size is quite small');
    }

    const isValid = issues.length === 0;

    return {
      isValid,
      issues,
      statistics: {
        totalChunks: chunks.length,
        averageSize: Math.round(averageSize),
        minSize,
        maxSize,
        totalContent
      }
    };
  }
}