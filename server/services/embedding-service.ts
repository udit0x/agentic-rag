import { OpenAI } from 'openai';

export interface EmbeddingResult {
  embedding: number[];
  dimensions: number;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  totalTokens: number;
  processingTimeMs: number;
}

export class EmbeddingService {
  private openai: OpenAI;
  private readonly model = 'text-embedding-3-large';
  private readonly dimensions = 3072; // Full dimensions for best quality
  private readonly maxInputLength = 8000; // Token limit for embeddings
  private readonly batchSize = 100; // Azure OpenAI batch limit

  constructor() {
    if (!process.env.AZURE_OPENAI_API_KEY || !process.env.AZURE_OPENAI_ENDPOINT) {
      throw new Error('Azure OpenAI configuration is missing. Please set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT environment variables.');
    }

    this.openai = new OpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-3-large'}`,
      defaultQuery: { 'api-version': '2024-02-01' },
      defaultHeaders: {
        'api-key': process.env.AZURE_OPENAI_API_KEY,
      },
    });

    console.log('[EMBEDDINGS] Service initialized with model:', this.model);
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    try {
      const startTime = Date.now();
      
      // Truncate text if too long
      const truncatedText = text.substring(0, this.maxInputLength);
      
      if (text.length > this.maxInputLength) {
        console.warn(`[EMBEDDINGS] Text truncated from ${text.length} to ${this.maxInputLength} characters`);
      }

      const response = await this.openai.embeddings.create({
        model: this.model,
        input: truncatedText,
        dimensions: this.dimensions,
      });

      const processingTime = Date.now() - startTime;
      console.log(`[EMBEDDINGS] Generated embedding for text (${truncatedText.length} chars) in ${processingTime}ms`);

      return {
        embedding: response.data[0].embedding,
        dimensions: this.dimensions,
        model: this.model,
        usage: {
          prompt_tokens: response.usage.prompt_tokens,
          total_tokens: response.usage.total_tokens,
        }
      };
    } catch (error) {
      console.error('[EMBEDDINGS] Error generating embedding:', error);
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batches
   */
  async batchGenerateEmbeddings(texts: string[]): Promise<BatchEmbeddingResult> {
    try {
      const startTime = Date.now();
      
      if (texts.length === 0) {
        return {
          embeddings: [],
          totalTokens: 0,
          processingTimeMs: 0
        };
      }

      console.log(`[EMBEDDINGS] Starting batch embedding generation for ${texts.length} texts`);

      // Process texts in batches
      const batches: string[][] = [];
      for (let i = 0; i < texts.length; i += this.batchSize) {
        const batch = texts.slice(i, i + this.batchSize).map(text => 
          text.substring(0, this.maxInputLength)
        );
        batches.push(batch);
      }

      console.log(`[EMBEDDINGS] Processing ${batches.length} batches of max ${this.batchSize} texts each`);

      // Process batches sequentially to avoid rate limits
      const allEmbeddings: number[][] = [];
      let totalTokens = 0;

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`[EMBEDDINGS] Processing batch ${i + 1}/${batches.length} with ${batch.length} texts`);

        try {
          const response = await this.openai.embeddings.create({
            model: this.model,
            input: batch,
            dimensions: this.dimensions,
          });

          const batchEmbeddings = response.data.map(item => item.embedding);
          allEmbeddings.push(...batchEmbeddings);
          totalTokens += response.usage.total_tokens;

          console.log(`[EMBEDDINGS] Batch ${i + 1} completed: ${batchEmbeddings.length} embeddings, ${response.usage.total_tokens} tokens`);

          // Add small delay between batches to respect rate limits
          if (i < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error(`[EMBEDDINGS] Error processing batch ${i + 1}:`, error);
          throw error;
        }
      }

      const processingTimeMs = Date.now() - startTime;
      console.log(`[EMBEDDINGS] Batch embedding generation completed: ${allEmbeddings.length} embeddings in ${processingTimeMs}ms`);

      return {
        embeddings: allEmbeddings,
        totalTokens,
        processingTimeMs
      };
    } catch (error) {
      console.error('[EMBEDDINGS] Error in batch embedding generation:', error);
      throw new Error(`Failed to generate batch embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  static cosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimension');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Find most similar embeddings from a collection
   */
  static findMostSimilar(
    queryEmbedding: number[], 
    candidateEmbeddings: { id: string; embedding: number[]; metadata?: any }[], 
    topK: number = 5
  ): Array<{ id: string; similarity: number; metadata?: any }> {
    const similarities = candidateEmbeddings.map(candidate => ({
      id: candidate.id,
      similarity: EmbeddingService.cosineSimilarity(queryEmbedding, candidate.embedding),
      metadata: candidate.metadata
    }));

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Validate embedding configuration
   */
  async validateConfiguration(): Promise<boolean> {
    try {
      console.log('[EMBEDDINGS] Validating configuration...');
      
      const testResult = await this.generateEmbedding('This is a test text for validation.');
      
      if (testResult.embedding.length !== this.dimensions) {
        throw new Error(`Expected ${this.dimensions} dimensions, got ${testResult.embedding.length}`);
      }

      console.log('[EMBEDDINGS] Configuration validation successful');
      return true;
    } catch (error) {
      console.error('[EMBEDDINGS] Configuration validation failed:', error);
      return false;
    }
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      model: string;
      dimensions: number;
      maxInputLength: number;
      batchSize: number;
      lastTestTime?: string;
      lastTestSuccess?: boolean;
    };
  }> {
    try {
      const testResult = await this.generateEmbedding('Health check test');
      
      return {
        status: 'healthy',
        details: {
          model: this.model,
          dimensions: this.dimensions,
          maxInputLength: this.maxInputLength,
          batchSize: this.batchSize,
          lastTestTime: new Date().toISOString(),
          lastTestSuccess: true
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          model: this.model,
          dimensions: this.dimensions,
          maxInputLength: this.maxInputLength,
          batchSize: this.batchSize,
          lastTestTime: new Date().toISOString(),
          lastTestSuccess: false
        }
      };
    }
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService();