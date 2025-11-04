import { SearchClient, AzureKeyCredential, SearchIndexClient } from '@azure/search-documents';
import { embeddingService } from './embedding-service';

export interface DocumentChunkIndex {
  id: string;
  documentId: string;
  content: string;
  contentVector: number[];
  filename: string;
  chunkIndex: number;
  metadata: string; // JSON string
  uploadedAt: string;
  contentLength: number;
  wordCount: number;
  embeddingModel: string;
}

export interface SearchResult {
  id: string;
  documentId: string;
  content: string;
  filename: string;
  score: number;
  highlights?: string[];
  captions?: string[];
  chunkIndex: number;
  metadata?: any;
}

export interface HybridSearchOptions {
  top?: number;
  semanticConfigurationName?: string;
  queryType?: 'simple' | 'full' | 'semantic';
  searchFields?: string[];
  select?: string[];
  filter?: string;
  orderBy?: string[];
}

export class AzureSearchService {
  private client: SearchClient<DocumentChunkIndex>;
  private indexClient: SearchIndexClient;
  private readonly indexName: string;

  constructor() {
    if (!process.env.AZURE_SEARCH_ENDPOINT || !process.env.AZURE_SEARCH_API_KEY || !process.env.AZURE_SEARCH_INDEX_NAME) {
      throw new Error('Azure Search configuration is missing. Please set AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_API_KEY, and AZURE_SEARCH_INDEX_NAME environment variables.');
    }

    this.indexName = process.env.AZURE_SEARCH_INDEX_NAME;
    const credential = new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY);

    this.client = new SearchClient<DocumentChunkIndex>(
      process.env.AZURE_SEARCH_ENDPOINT,
      this.indexName,
      credential
    );

    this.indexClient = new SearchIndexClient(
      process.env.AZURE_SEARCH_ENDPOINT,
      credential
    );

    console.log(`[AZURE_SEARCH] Service initialized for index: ${this.indexName}`);
  }

  /**
   * Create or update the search index with proper field definitions
   */
  async createOrUpdateIndex(): Promise<void> {
    try {
      console.log('[AZURE_SEARCH] Creating/updating search index...');

      const indexDefinition = {
        name: this.indexName,
        fields: [
          {
            name: 'id',
            type: 'Edm.String' as const,
            key: true,
            searchable: false,
            filterable: true,
            retrievable: true,
            sortable: false,
            facetable: false
          },
          {
            name: 'documentId',
            type: 'Edm.String' as const,
            searchable: false,
            filterable: true,
            retrievable: true,
            sortable: false,
            facetable: true
          },
          {
            name: 'content',
            type: 'Edm.String' as const,
            searchable: true,
            filterable: false,
            retrievable: true,
            sortable: false,
            facetable: false,
            analyzer: 'en.microsoft' as const
          },
          {
            name: 'filename',
            type: 'Edm.String' as const,
            searchable: true,
            filterable: true,
            retrievable: true,
            sortable: true,
            facetable: true
          },
          {
            name: 'chunkIndex',
            type: 'Edm.Int32' as const,
            searchable: false,
            filterable: true,
            retrievable: true,
            sortable: true,
            facetable: false
          },
          {
            name: 'metadata',
            type: 'Edm.String' as const,
            searchable: false,
            filterable: false,
            retrievable: true,
            sortable: false,
            facetable: false
          },
          {
            name: 'uploadedAt',
            type: 'Edm.DateTimeOffset' as const,
            searchable: false,
            filterable: true,
            retrievable: true,
            sortable: true,
            facetable: false
          },
          {
            name: 'contentLength',
            type: 'Edm.Int32' as const,
            searchable: false,
            filterable: true,
            retrievable: true,
            sortable: true,
            facetable: false
          },
          {
            name: 'wordCount',
            type: 'Edm.Int32' as const,
            searchable: false,
            filterable: true,
            retrievable: true,
            sortable: true,
            facetable: false
          },
          {
            name: 'embeddingModel',
            type: 'Edm.String' as const,
            searchable: false,
            filterable: true,
            retrievable: true,
            sortable: false,
            facetable: true
          }
        ]
      };

      await this.indexClient.createOrUpdateIndex(indexDefinition as any);
      console.log('[AZURE_SEARCH] Index created/updated successfully');
    } catch (error) {
      console.error('[AZURE_SEARCH] Error creating/updating index:', error);
      throw new Error(`Failed to create/update search index: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Index document chunks with embeddings
   */
  async indexDocumentChunks(chunks: Array<{
    id: string;
    documentId: string;
    content: string;
    filename: string;
    chunkIndex: number;
    metadata?: any;
    uploadedAt: Date;
  }>): Promise<void> {
    try {
      console.log(`[AZURE_SEARCH] Indexing ${chunks.length} document chunks...`);

      // Generate embeddings for all chunks
      const chunkContents = chunks.map(chunk => chunk.content);
      const embeddingResult = await embeddingService.batchGenerateEmbeddings(chunkContents);

      // Prepare documents for indexing
      const documents: DocumentChunkIndex[] = chunks.map((chunk, index) => ({
        id: chunk.id,
        documentId: chunk.documentId,
        content: chunk.content,
        contentVector: embeddingResult.embeddings[index],
        filename: chunk.filename,
        chunkIndex: chunk.chunkIndex,
        metadata: JSON.stringify(chunk.metadata || {}),
        uploadedAt: chunk.uploadedAt.toISOString(),
        contentLength: chunk.content.length,
        wordCount: chunk.content.split(/\s+/).filter(w => w.length > 0).length,
        embeddingModel: 'text-embedding-3-large'
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
   * Perform hybrid search (text + vector similarity)
   */
  async hybridSearch(query: string, options: HybridSearchOptions = {}): Promise<SearchResult[]> {
    try {
      const {
        top = 5,
        semanticConfigurationName = 'semantic-config',
        queryType = 'semantic',
        searchFields = ['content', 'filename'],
        select = ['id', 'documentId', 'content', 'filename', 'chunkIndex', 'metadata', 'contentLength', 'wordCount'],
        filter,
        orderBy
      } = options;

      console.log(`[AZURE_SEARCH] Performing hybrid search for query: "${query}"`);

      // Generate query embedding
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      // Perform search with both text and vector queries
      const searchResults = await this.client.search(query, {
        top,
        queryType: queryType as any,
        searchFields: searchFields as any,
        select: select as any,
        filter,
        orderBy,
        semanticSearchOptions: queryType === 'semantic' ? {
          configurationName: semanticConfigurationName,
          captions: {
            captionType: 'extractive'
          },
          answers: {
            answerType: 'extractive',
            count: 1
          }
        } : undefined,
        vectorSearchOptions: {
          queries: [{
            kind: 'vector',
            vector: queryEmbedding.embedding,
            kNearestNeighborsCount: top,
            fields: ['contentVector']
          }]
        },
        highlightFields: 'content'
      });

      const results: SearchResult[] = [];
      for await (const result of searchResults.results) {
        const metadata = result.document.metadata ? JSON.parse(result.document.metadata) : {};
        
        results.push({
          id: result.document.id,
          documentId: result.document.documentId,
          content: result.document.content,
          filename: result.document.filename,
          score: result.score || 0,
          highlights: result.highlights?.content || [],
          captions: (result.captions?.map(c => c.text).filter(Boolean) as string[]) || [],
          chunkIndex: result.document.chunkIndex,
          metadata
        });
      }

      console.log(`[AZURE_SEARCH] Found ${results.length} results`);
      return results;
    } catch (error) {
      console.error('[AZURE_SEARCH] Error performing hybrid search:', error);
      throw new Error(`Failed to perform hybrid search: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform semantic search only (no vector)
   */
  async semanticSearch(query: string, options: HybridSearchOptions = {}): Promise<SearchResult[]> {
    try {
      const {
        top = 5,
        semanticConfigurationName = 'semantic-config',
        searchFields = ['content', 'filename'],
        select = ['id', 'documentId', 'content', 'filename', 'chunkIndex', 'metadata'],
        filter
      } = options;

      console.log(`[AZURE_SEARCH] Performing semantic search for query: "${query}"`);

      const searchResults = await this.client.search(query, {
        top,
        queryType: 'semantic',
        searchFields: searchFields as any,
        select: select as any,
        filter,
        semanticSearchOptions: {
          configurationName: semanticConfigurationName,
          captions: {
            captionType: 'extractive'
          }
        },
        highlightFields: 'content'
      });

      const results: SearchResult[] = [];
      for await (const result of searchResults.results) {
        const metadata = result.document.metadata ? JSON.parse(result.document.metadata) : {};
        
        results.push({
          id: result.document.id,
          documentId: result.document.documentId,
          content: result.document.content,
          filename: result.document.filename,
          score: result.score || 0,
          highlights: result.highlights?.content || [],
          captions: (result.captions?.map(c => c.text).filter(Boolean) as string[]) || [],
          chunkIndex: result.document.chunkIndex,
          metadata
        });
      }

      console.log(`[AZURE_SEARCH] Semantic search found ${results.length} results`);
      return results;
    } catch (error) {
      console.error('[AZURE_SEARCH] Error performing semantic search:', error);
      throw new Error(`Failed to perform semantic search: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform vector search only (no text)
   */
  async vectorSearch(query: string, options: HybridSearchOptions = {}): Promise<SearchResult[]> {
    try {
      const {
        top = 5,
        select = ['id', 'documentId', 'content', 'filename', 'chunkIndex', 'metadata'],
        filter
      } = options;

      console.log(`[AZURE_SEARCH] Performing vector search for query: "${query}"`);

      // Generate query embedding
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      const searchResults = await this.client.search('*', {
        top,
        select: select as any,
        filter,
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
        const metadata = result.document.metadata ? JSON.parse(result.document.metadata) : {};
        
        results.push({
          id: result.document.id,
          documentId: result.document.documentId,
          content: result.document.content,
          filename: result.document.filename,
          score: result.score || 0,
          highlights: [],
          captions: [],
          chunkIndex: result.document.chunkIndex,
          metadata
        });
      }

      console.log(`[AZURE_SEARCH] Vector search found ${results.length} results`);
      return results;
    } catch (error) {
      console.error('[AZURE_SEARCH] Error performing vector search:', error);
      throw new Error(`Failed to perform vector search: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        select: ['id']
      });

      const idsToDelete: string[] = [];
      for await (const result of searchResults.results) {
        idsToDelete.push(result.document.id);
      }

      if (idsToDelete.length === 0) {
        console.log(`[AZURE_SEARCH] No chunks found for document: ${documentId}`);
        return;
      }

      // Delete the documents
      const documentsToDelete = idsToDelete.map(id => ({ id })) as any[];
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
      indexStats?: any;
    };
  }> {
    try {
      // Try to get index statistics
      const indexStats = await this.indexClient.getIndex(this.indexName);
      
      return {
        status: 'healthy',
        details: {
          indexName: this.indexName,
          endpoint: process.env.AZURE_SEARCH_ENDPOINT!,
          lastTestTime: new Date().toISOString(),
          lastTestSuccess: true,
          indexStats: {
            documentCount: indexStats.fields?.length || 0,
            storageSize: 'unknown' // Azure Search doesn't expose storage size in basic tier
          }
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
          lastTestSuccess: false
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
export const azureSearchService = new AzureSearchService();