import { SearchClient, AzureKeyCredential, SearchIndexClient } from '@azure/search-documents';
import { embeddingService } from './embedding-service';

export interface ExistingDocumentChunkIndex {
  id: string;
  content: string;
  documentId: string;
  filename: string;
  chunkIndex: number;
  contentVector?: number[];
}

export interface SearchResult {
  id: string;
  documentId: string;
  content: string;
  filename: string;
  score: number;
  highlights?: string[];
  chunkIndex: number;
}

export class AzureSearchServiceCompatible {
  private client: SearchClient<ExistingDocumentChunkIndex>;
  private indexClient: SearchIndexClient;
  private readonly indexName: string;

  constructor() {
    if (!process.env.AZURE_SEARCH_ENDPOINT || !process.env.AZURE_SEARCH_API_KEY || !process.env.AZURE_SEARCH_INDEX_NAME) {
      throw new Error('Azure Search configuration is missing. Please set AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_API_KEY, and AZURE_SEARCH_INDEX_NAME environment variables.');
    }

    this.indexName = process.env.AZURE_SEARCH_INDEX_NAME;
    const credential = new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY);

    this.client = new SearchClient<ExistingDocumentChunkIndex>(
      process.env.AZURE_SEARCH_ENDPOINT,
      this.indexName,
      credential
    );

    this.indexClient = new SearchIndexClient(
      process.env.AZURE_SEARCH_ENDPOINT,
      credential
    );

    console.log(`[AZURE_SEARCH] Service initialized for existing index: ${this.indexName}`);
  }

  /**
   * Index document chunks with embeddings (compatible with existing schema)
   */
  async indexDocumentChunks(chunks: Array<{
    id: string;
    documentId: string;
    content: string;
    filename: string;
    chunkIndex: number;
    uploadedAt?: Date;
  }>): Promise<void> {
    try {
      console.log(`[AZURE_SEARCH] Indexing ${chunks.length} document chunks with embeddings...`);

      // Generate embeddings for all chunks
      const chunkContents = chunks.map(chunk => chunk.content);
      const embeddingResult = await embeddingService.batchGenerateEmbeddings(chunkContents);

      // Prepare documents for indexing (matching existing schema)
      const documents: ExistingDocumentChunkIndex[] = chunks.map((chunk, index) => ({
        id: chunk.id,
        content: chunk.content,
        documentId: chunk.documentId,
        filename: chunk.filename,
        chunkIndex: chunk.chunkIndex,
        contentVector: embeddingResult.embeddings[index]
      }));

      // Upload documents to Azure Search
      const uploadResult = await this.client.uploadDocuments(documents);

      const successCount = uploadResult.results.filter(r => r.succeeded).length;
      const failCount = uploadResult.results.filter(r => !r.succeeded).length;

      console.log(`[AZURE_SEARCH] Indexing completed: ${successCount} success, ${failCount} failed`);

      if (failCount > 0) {
        const failures = uploadResult.results.filter(r => !r.succeeded);
        console.error('[AZURE_SEARCH] Failed uploads:', failures);
      }
    } catch (error) {
      console.error('[AZURE_SEARCH] Error indexing document chunks:', error);
      throw new Error(`Failed to index document chunks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform text search
   */
  async textSearch(query: string, options: {
    top?: number;
    filter?: string;
  } = {}): Promise<SearchResult[]> {
    try {
      const { top = 5, filter } = options;

      console.log(`[AZURE_SEARCH] Performing text search for query: "${query}"`);

      const searchResults = await this.client.search(query, {
        top,
        searchFields: ['content', 'filename'] as any,
        select: ['id', 'content', 'documentId', 'filename', 'chunkIndex'] as any,
        filter,
        highlightFields: 'content' as any
      });

      const results: SearchResult[] = [];
      for await (const result of searchResults.results) {
        results.push({
          id: result.document.id,
          documentId: result.document.documentId,
          content: result.document.content,
          filename: result.document.filename,
          score: result.score || 0,
          highlights: result.highlights?.content || [],
          chunkIndex: result.document.chunkIndex
        });
      }

      console.log(`[AZURE_SEARCH] Found ${results.length} text search results`);
      return results;
    } catch (error) {
      console.error('[AZURE_SEARCH] Error performing text search:', error);
      throw new Error(`Failed to perform text search: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform vector search using the existing contentVector field
   */
  async vectorSearch(query: string, options: { top?: number } = {}): Promise<SearchResult[]> {
    try {
      const { top = 5 } = options;

      console.log(`[AZURE_SEARCH] Performing vector search for query: "${query}"`);

      // Generate query embedding
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      const searchResults = await this.client.search('*', {
        top,
        select: ['id', 'content', 'documentId', 'filename', 'chunkIndex'] as any,
        vectorSearchOptions: {
          queries: [{
            kind: 'vector',
            vector: queryEmbedding.embedding,
            kNearestNeighborsCount: top,
            fields: ['contentVector']
          }]
        }
      });

      const results: SearchResult[] = [];
      for await (const result of searchResults.results) {
        results.push({
          id: result.document.id,
          documentId: result.document.documentId,
          content: result.document.content,
          filename: result.document.filename,
          score: result.score || 0,
          highlights: [],
          chunkIndex: result.document.chunkIndex
        });
      }

      console.log(`[AZURE_SEARCH] Found ${results.length} vector search results`);
      return results;
    } catch (error) {
      console.error('[AZURE_SEARCH] Error performing vector search:', error);
      throw new Error(`Failed to perform vector search: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform hybrid search (text + vector)
   */
  async hybridSearch(query: string, options: { top?: number } = {}): Promise<SearchResult[]> {
    try {
      const { top = 5 } = options;

      console.log(`[AZURE_SEARCH] Performing hybrid search for query: "${query}"`);

      // Generate query embedding
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      const searchResults = await this.client.search(query, {
        top,
        searchFields: ['content', 'filename'] as any,
        select: ['id', 'content', 'documentId', 'filename', 'chunkIndex'] as any,
        vectorSearchOptions: {
          queries: [{
            kind: 'vector',
            vector: queryEmbedding.embedding,
            kNearestNeighborsCount: top,
            fields: ['contentVector']
          }]
        },
        highlightFields: 'content' as any
      });

      const results: SearchResult[] = [];
      for await (const result of searchResults.results) {
        results.push({
          id: result.document.id,
          documentId: result.document.documentId,
          content: result.document.content,
          filename: result.document.filename,
          score: result.score || 0,
          highlights: result.highlights?.content || [],
          chunkIndex: result.document.chunkIndex
        });
      }

      console.log(`[AZURE_SEARCH] Found ${results.length} hybrid search results`);
      return results;
    } catch (error) {
      console.error('[AZURE_SEARCH] Error performing hybrid search:', error);
      throw new Error(`Failed to perform hybrid search: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete documents by document ID
   */
  async deleteDocumentChunks(documentId: string): Promise<void> {
    try {
      console.log(`[AZURE_SEARCH] Deleting chunks for document: ${documentId}`);

      // First, find all chunks for this document
      const searchResults = await this.client.search('*', {
        filter: `documentId eq '${documentId}'`,
        select: ['id'] as any
      });

      const idsToDelete: string[] = [];
      for await (const result of searchResults.results) {
        idsToDelete.push(result.document.id);
      }

      if (idsToDelete.length === 0) {
        console.log(`[AZURE_SEARCH] No chunks found for document: ${documentId}`);
        return;
      }

      // Delete the documents by creating minimal delete objects
      const documentsToDelete = idsToDelete.map(id => ({ id }) as any);
      const deleteResult = await this.client.deleteDocuments(documentsToDelete);

      const successCount = deleteResult.results.filter(r => r.succeeded).length;
      console.log(`[AZURE_SEARCH] Deleted ${successCount}/${idsToDelete.length} chunks for document: ${documentId}`);
    } catch (error) {
      console.error('[AZURE_SEARCH] Error deleting document chunks:', error);
      throw new Error(`Failed to delete document chunks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get search service health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      indexName: string;
      endpoint: string;
      lastTestTime?: string;
      lastTestSuccess?: boolean;
      indexExists?: boolean;
      vectorSearchEnabled?: boolean;
    };
  }> {
    try {
      // Try to get index information
      const index = await this.indexClient.getIndex(this.indexName);
      const hasVectorSearch = !!index.vectorSearch && !!index.vectorSearch.profiles && index.vectorSearch.profiles.length > 0;
      
      return {
        status: 'healthy',
        details: {
          indexName: this.indexName,
          endpoint: process.env.AZURE_SEARCH_ENDPOINT!,
          lastTestTime: new Date().toISOString(),
          lastTestSuccess: true,
          indexExists: !!index,
          vectorSearchEnabled: hasVectorSearch
        }
      };
    } catch (error) {
      console.error('[AZURE_SEARCH] Health check failed:', error);
      return {
        status: 'unhealthy',
        details: {
          indexName: this.indexName,
          endpoint: process.env.AZURE_SEARCH_ENDPOINT!,
          lastTestTime: new Date().toISOString(),
          lastTestSuccess: false,
          indexExists: false,
          vectorSearchEnabled: false
        }
      };
    }
  }

  /**
   * Get search statistics
   */
  async getSearchStatistics(): Promise<{
    totalDocuments: number;
    indexSize: string;
    lastUpdated?: string;
  }> {
    try {
      // Perform a count query
      const countResult = await this.client.search('*', {
        top: 0,
        includeTotalCount: true
      });

      return {
        totalDocuments: countResult.count || 0,
        indexSize: 'unknown', // Azure Search doesn't expose size in basic tier
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('[AZURE_SEARCH] Error getting statistics:', error);
      return {
        totalDocuments: 0,
        indexSize: 'unknown',
        lastUpdated: new Date().toISOString()
      };
    }
  }
}

// Export singleton instance
export const azureSearchService = new AzureSearchServiceCompatible();