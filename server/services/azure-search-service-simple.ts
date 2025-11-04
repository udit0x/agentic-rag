import { SearchClient, AzureKeyCredential, SearchIndexClient } from '@azure/search-documents';
import { embeddingService } from './embedding-service';

export interface DocumentChunkIndex {
  id: string;
  documentId: string;
  content: string;
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
  chunkIndex: number;
  metadata?: any;
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
   * Create or update the search index with basic text search
   */
  async createOrUpdateIndex(): Promise<void> {
    try {
      console.log('[AZURE_SEARCH] Creating/updating basic search index...');

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
            analyzer: 'en.microsoft'
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

      await this.indexClient.createOrUpdateIndex(indexDefinition);
      console.log('[AZURE_SEARCH] Index created/updated successfully');
    } catch (error) {
      console.error('[AZURE_SEARCH] Error creating/updating index:', error);
      throw new Error(`Failed to create/update search index: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Index document chunks (without embeddings for now)
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

      // Prepare documents for indexing (without embeddings)
      const documents: DocumentChunkIndex[] = chunks.map((chunk) => ({
        id: chunk.id,
        documentId: chunk.documentId,
        content: chunk.content,
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
   * Perform text search
   */
  async textSearch(query: string, options: {
    top?: number;
    searchFields?: string[];
    select?: string[];
    filter?: string;
    orderBy?: string[];
  } = {}): Promise<SearchResult[]> {
    try {
      const {
        top = 5,
        searchFields = ['content', 'filename'],
        select = ['id', 'documentId', 'content', 'filename', 'chunkIndex', 'metadata', 'contentLength', 'wordCount'],
        filter,
        orderBy
      } = options;

      console.log(`[AZURE_SEARCH] Performing text search for query: "${query}"`);

      const searchResults = await this.client.search(query, {
        top,
        searchFields: searchFields as any,
        select: select as any,
        filter,
        orderBy,
        highlightFields: 'content' as any
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
          chunkIndex: result.document.chunkIndex,
          metadata
        });
      }

      console.log(`[AZURE_SEARCH] Found ${results.length} results`);
      return results;
    } catch (error) {
      console.error('[AZURE_SEARCH] Error performing text search:', error);
      throw new Error(`Failed to perform text search: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Simulate vector search using in-memory embeddings
   */
  async vectorSearch(query: string, options: { top?: number } = {}): Promise<SearchResult[]> {
    try {
      const { top = 5 } = options;

      console.log(`[AZURE_SEARCH] Simulating vector search for query: "${query}"`);

      // Get all documents first
      const allResults = await this.client.search('*', {
        top: 100, // Get more documents for better vector comparison
        select: ['id', 'documentId', 'content', 'filename', 'chunkIndex', 'metadata'] as any
      });

      const documents: any[] = [];
      for await (const result of allResults.results) {
        documents.push(result.document);
      }

      if (documents.length === 0) {
        console.log('[AZURE_SEARCH] No documents found for vector search');
        return [];
      }

      // Generate embeddings for query and all documents
      const queryEmbedding = await embeddingService.generateEmbedding(query);
      const documentContents = documents.map(doc => doc.content);
      const documentEmbeddings = await embeddingService.batchGenerateEmbeddings(documentContents);

      // Calculate similarities
      const similarities = documentEmbeddings.embeddings.map((embedding, index) => ({
        document: documents[index],
        similarity: this.cosineSimilarity(queryEmbedding.embedding, embedding)
      }));

      // Sort by similarity and take top results
      const topResults = similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, top);

      const results: SearchResult[] = topResults.map(({ document, similarity }) => {
        const metadata = document.metadata ? JSON.parse(document.metadata) : {};
        
        return {
          id: document.id,
          documentId: document.documentId,
          content: document.content,
          filename: document.filename,
          score: similarity,
          highlights: [],
          chunkIndex: document.chunkIndex,
          metadata
        };
      });

      console.log(`[AZURE_SEARCH] Vector search found ${results.length} results`);
      return results;
    } catch (error) {
      console.error('[AZURE_SEARCH] Error performing vector search:', error);
      throw new Error(`Failed to perform vector search: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Hybrid search combining text and vector search
   */
  async hybridSearch(query: string, options: { top?: number } = {}): Promise<SearchResult[]> {
    try {
      const { top = 5 } = options;

      console.log(`[AZURE_SEARCH] Performing hybrid search for query: "${query}"`);

      // Perform both text and vector searches
      const [textResults, vectorResults] = await Promise.all([
        this.textSearch(query, { top: Math.ceil(top * 1.5) }),
        this.vectorSearch(query, { top: Math.ceil(top * 1.5) })
      ]);

      // Combine and deduplicate results
      const combinedResults = new Map<string, SearchResult>();

      // Add text results with boosted scores
      textResults.forEach(result => {
        result.score = result.score * 1.2; // Boost text search scores
        combinedResults.set(result.id, result);
      });

      // Add vector results, combining scores if already exists
      vectorResults.forEach(result => {
        const existing = combinedResults.get(result.id);
        if (existing) {
          // Combine scores
          existing.score = (existing.score + result.score) / 2;
        } else {
          combinedResults.set(result.id, result);
        }
      });

      // Sort by combined score and take top results
      const finalResults = Array.from(combinedResults.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, top);

      console.log(`[AZURE_SEARCH] Hybrid search found ${finalResults.length} results`);
      return finalResults;
    } catch (error) {
      console.error('[AZURE_SEARCH] Error performing hybrid search:', error);
      throw new Error(`Failed to perform hybrid search: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
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

      // Delete the documents by ID only
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
    };
  }> {
    try {
      // Try to get index information
      const index = await this.indexClient.getIndex(this.indexName);
      
      return {
        status: 'healthy',
        details: {
          indexName: this.indexName,
          endpoint: process.env.AZURE_SEARCH_ENDPOINT!,
          lastTestTime: new Date().toISOString(),
          lastTestSuccess: true,
          indexExists: !!index
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
          indexExists: false
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