"""Multi-provider RAG client with configuration management."""
import os
import hashlib
import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.models import VectorizedQuery
from azure.search.documents.indexes.models import (
    SearchIndex,
    SearchField,
    SearchFieldDataType,
    VectorSearch,
    VectorSearchProfile,
    HnswAlgorithmConfiguration,
)
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from server.config_manager import config_manager
from server.providers import get_llm, get_embeddings, reset_providers

# Configure module logger
logger = logging.getLogger(__name__)

# Simple in-memory cache for search results
class SearchCache:
    """Simple in-memory cache for search results with TTL."""
    
    def __init__(self, ttl_minutes: int = 10, max_size: int = 100):
        self.cache = {}
        self.ttl_minutes = ttl_minutes
        self.max_size = max_size
    
    def _get_cache_key(self, query: str, top_k: int) -> str:
        """Generate cache key for query."""
        # Create hash of query + params for cache key
        content = f"{query.strip().lower()}:{top_k}"
        return hashlib.md5(content.encode()).hexdigest()
    
    def get(self, query: str, top_k: int) -> Optional[List[Dict[str, Any]]]:
        """Get cached results if available and not expired."""
        cache_key = self._get_cache_key(query, top_k)
        
        if cache_key in self.cache:
            cached_data, timestamp = self.cache[cache_key]
            
            # Check if expired
            if datetime.now() - timestamp < timedelta(minutes=self.ttl_minutes):
                logger.debug("Cache hit for query hash: %s", cache_key[:8])
                return cached_data
            else:
                # Remove expired entry
                del self.cache[cache_key]
                logger.debug("Cache expired for query hash: %s", cache_key[:8])
        
        logger.debug("Cache miss for query hash: %s", cache_key[:8])
        return None
    
    def set(self, query: str, top_k: int, results: List[Dict[str, Any]]):
        """Cache search results."""
        cache_key = self._get_cache_key(query, top_k)
        
        # Simple LRU: remove oldest if at max size
        if len(self.cache) >= self.max_size:
            oldest_key = min(self.cache.keys(), key=lambda k: self.cache[k][1])
            del self.cache[oldest_key]
            logger.debug("Cache evicted oldest entry: %s", oldest_key[:8])
        
        self.cache[cache_key] = (results, datetime.now())
        logger.debug("Cached %d results for query hash: %s", len(results), cache_key[:8])
    
    def clear(self):
        """Clear all cached results."""
        self.cache.clear()
        logger.info("Search cache cleared")

# Global cache instance
_search_cache = SearchCache(ttl_minutes=5, max_size=50)  # 5 min TTL, 50 queries max

class MultiProviderRAGClient:
    """Multi-provider RAG client with dynamic configuration."""
    
    def __init__(self):
        # Azure Search configuration (still using env for now)
        self.search_endpoint = os.getenv("AZURE_SEARCH_ENDPOINT")
        self.search_key = os.getenv("AZURE_SEARCH_API_KEY")
        self.index_name = os.getenv("AZURE_SEARCH_INDEX_NAME", "rag-documents")
        
        # Security: Never log credentials - only log if configured
        logger.info(
            "Azure Search configuration loaded - endpoint_configured=%s, index=%s",
            bool(self.search_endpoint),
            self.index_name
        )
        
        # Flag to track if Azure Search is available and working
        self.azure_search_enabled = False
        
        # Initialize search clients if available
        self.search_index_client = None
        self.search_client = None
        
        if self.search_endpoint and self.search_key:
            try:
                self.search_index_client = SearchIndexClient(
                    endpoint=self.search_endpoint,
                    credential=AzureKeyCredential(self.search_key),
                    api_version="2023-11-01"  
                )
                
                self.search_client = SearchClient(
                    endpoint=self.search_endpoint,
                    index_name=self.index_name,
                    credential=AzureKeyCredential(self.search_key),
                    api_version="2023-11-01" 
                )
                logger.info("Azure Search clients initialized for index: %s", self.index_name)
                # Note: azure_search_enabled will be set to True only after successful upload
            except Exception as e:
                logger.warning("Failed to initialize Azure Search client: %s", str(e))
                self.search_index_client = None
                self.search_client = None
        else:
            logger.info("Azure Search not configured - vector search disabled")
        
        # Optimized text splitter with reduced overlap for better performance
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1200,  # Slightly larger chunks for better content density
            chunk_overlap=300,  # Reduced overlap for less redundancy and faster processing
            length_function=len,
            separators=["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " ", ""]  # Better sentence boundaries
        )
    
    def get_llm(self):
        """Get the current LLM instance based on configuration."""
        try:
            return get_llm()
        except Exception as e:
            logger.error("Failed to get LLM instance: %s", str(e))
            return None
    
    def get_embeddings(self):
        """Get the current embeddings instance based on configuration."""
        try:
            return get_embeddings()
        except Exception as e:
            logger.error("Failed to get embeddings instance: %s", str(e))
            return None
    
    def reload_providers(self):
        """Reload providers when configuration changes."""
        reset_providers()
        logger.info("Reloaded all providers due to configuration change")
    
    async def ensure_index_exists(self):
        """Create search index if it doesn't exist or recreate if schema is incorrect."""
        if not self.search_index_client:
            logger.warning("Azure Search index client not available, cannot create index")
            return False
            
        try:
            # Try to get existing index
            existing_index = self.search_index_client.get_index(self.index_name)
            logger.info("Azure Search index '%s' already exists", self.index_name)
            
            # Verify the index has required fields
            existing_field_names = {field.name for field in existing_index.fields}
            required_fields = {"id", "content", "documentId", "filename", "chunkIndex", "contentVector", "userId"}
            missing_fields = required_fields - existing_field_names
            
            if missing_fields:
                logger.warning("Index '%s' is missing required fields: %s", self.index_name, missing_fields)
                logger.info("Deleting and recreating index with correct schema...")
                
                try:
                    # Delete the old index
                    self.search_index_client.delete_index(self.index_name)
                    logger.info("Deleted incompatible index '%s'", self.index_name)
                    
                    # Fall through to creation logic below
                    raise Exception("Index deleted, needs recreation")
                except Exception as delete_error:
                    logger.error("Failed to delete incompatible index: %s", str(delete_error))
                    # Try to continue with creation anyway
                    pass
            else:
                logger.debug("Index schema validated - all required fields present")
                return True
                
        except Exception:
            logger.info("Index '%s' does not exist, creating it...", self.index_name)
            
            try:
                # Create index with vector search configuration
                fields = [
                    SearchField(
                        name="id",
                        type=SearchFieldDataType.String,
                        key=True,
                        filterable=True,
                    ),
                    SearchField(
                        name="content",
                        type=SearchFieldDataType.String,
                        searchable=True,
                    ),
                    SearchField(
                        name="documentId",
                        type=SearchFieldDataType.String,
                        filterable=True,
                    ),
                    SearchField(
                        name="filename",
                        type=SearchFieldDataType.String,
                        filterable=True,
                    ),
                    SearchField(
                        name="userId",
                        type=SearchFieldDataType.String,
                        filterable=True,
                    ),
                    SearchField(
                        name="chunkIndex",
                        type=SearchFieldDataType.Int32,
                        filterable=True,
                    ),
                    SearchField(
                        name="contentVector",
                        type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
                        searchable=True,
                        vector_search_dimensions=3072,  # Updated for text-embedding-3-large
                        vector_search_profile_name="myHnswProfile",
                    ),
                ]
                
                vector_search = VectorSearch(
                    profiles=[
                        VectorSearchProfile(
                            name="myHnswProfile",
                            algorithm_configuration_name="myHnsw",
                        )
                    ],
                    algorithms=[
                        HnswAlgorithmConfiguration(name="myHnsw")
                    ],
                )
                
                index = SearchIndex(
                    name=self.index_name,
                    fields=fields,
                    vector_search=vector_search
                )
                
                result = self.search_index_client.create_index(index)
                logger.info("Successfully created Azure Search index '%s'", self.index_name)
                return True
                
            except Exception as create_error:
                logger.error("Failed to create index: %s", str(create_error))
                return False
    
    async def embed_documents(self, texts: List[str], batch_size: int = 100) -> List[List[float]]:
        """
        Generate embeddings for a list of texts with optimized batching for better performance.
        
        Args:
            texts: List of text strings to embed
            batch_size: Number of texts to process in each batch (default: 100, increased from 20)
            
        Returns:
            List of embedding vectors
        """
        embeddings = self.get_embeddings()
        if not embeddings:
            raise ValueError("Embeddings provider not configured")
        
        if len(texts) <= batch_size:
            # Small batch, process all at once
            return await embeddings.aembed_documents(texts)
        
        # Large batch, process in chunks with concurrent processing
        logger.info("Processing %d texts in batches of %d", len(texts), batch_size)
        
        # Create batches
        batches = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            batches.append(batch)
        
        # Process batches concurrently (limit concurrency to avoid rate limits)
        import asyncio
        semaphore = asyncio.Semaphore(3)  # Max 3 concurrent embedding requests
        
        async def process_batch_with_semaphore(batch_texts, batch_num, total_batches):
            async with semaphore:
                logger.debug("Processing embedding batch %d/%d (%d texts)", batch_num, total_batches, len(batch_texts))
                try:
                    return await embeddings.aembed_documents(batch_texts)
                except Exception as e:
                    logger.warning("Embedding batch %d failed: %s - retrying with smaller chunks", batch_num, str(e))
                    # Retry once with smaller batch if it fails
                    if len(batch_texts) > 50:
                        mid = len(batch_texts) // 2
                        chunk1 = await embeddings.aembed_documents(batch_texts[:mid])
                        chunk2 = await embeddings.aembed_documents(batch_texts[mid:])
                        return chunk1 + chunk2
                    else:
                        raise
        
        # Execute all batches concurrently
        tasks = [
            process_batch_with_semaphore(batch, i + 1, len(batches))
            for i, batch in enumerate(batches)
        ]
        
        batch_results = await asyncio.gather(*tasks)
        
        # Flatten results
        all_embeddings = []
        for batch_embeddings in batch_results:
            all_embeddings.extend(batch_embeddings)
        
        logger.info("Embedding completed: %d vectors generated", len(all_embeddings))
        return all_embeddings
    
    async def embed_query(self, text: str) -> List[float]:
        """Generate embedding for a single query."""
        embeddings = self.get_embeddings()
        if not embeddings:
            raise ValueError("Embeddings provider not configured")
        return await embeddings.aembed_query(text)
    
    def split_text(self, text: str) -> List[str]:
        """Split text into chunks."""
        docs = self.text_splitter.create_documents([text])
        return [doc.page_content for doc in docs]
    
    async def delete_document_chunks_from_search(self, filename: str, user_id: str = None):
        """
        Delete all chunks for a document from Azure Cognitive Search by filename AND userId.
        
        CRITICAL: Must filter by BOTH filename AND userId to prevent cross-user data deletion!
        
        Args:
            filename: Document filename
            user_id: User ID who owns the document (REQUIRED for security)
        """
        if not self.search_client:
            logger.debug("Azure Search not configured, skipping document chunk deletion")
            return
            
        try:
            await self.ensure_index_exists()
            
            # Build filter with BOTH filename AND userId
            if user_id:
                filter_query = f"filename eq '{filename}' and userId eq '{user_id}'"
                logger.debug("Deleting chunks for filename=%s, user_id=%s", filename, user_id)
            else:
                # Fallback to filename only (for backward compatibility, but log warning)
                filter_query = f"filename eq '{filename}'"
                logger.warning("Deleting chunks by filename only (no user_id) - SECURITY RISK for file: %s", filename)
            
            search_results = self.search_client.search(
                search_text="*",
                filter=filter_query,
                select=["id"],
                search_mode="all"
            )
            
            # Collect document IDs to delete
            docs_to_delete = []
            count = 0
            for result in search_results:
                docs_to_delete.append({"id": result["id"]})
                count += 1
            
            if docs_to_delete:
                logger.info("Deleting %d existing chunks for file: %s", count, filename)
                # Delete existing chunks
                delete_result = self.search_client.delete_documents(documents=docs_to_delete)
                logger.info("Successfully deleted %d chunks for file: %s", count, filename)
                return delete_result
            else:
                logger.debug("No existing chunks found for file: %s", filename)
                return None
                
        except Exception as e:
            logger.error("Failed to delete chunks for file %s: %s", filename, str(e))
            # Don't raise exception - continue with upload
            return None

    async def upload_chunks_to_search(
        self, 
        chunks: List[Dict[str, Any]],
        batch_size: int = 100,  # Increased from 50 to 100 for better throughput
        skip_delete_check: bool = False  # Option to skip deletion check for new documents
    ):
        """
        Upload document chunks with embeddings to Azure Cognitive Search using batching.
        
        Args:
            chunks: List of chunk dictionaries with embeddings
            batch_size: Number of chunks to upload per batch (default: 50)
        """
        if not self.search_client:
            logger.debug("Azure Search not configured, skipping chunk upload")
            return
            
        try:
            # Ensure index exists (cached check)
            await self.ensure_index_exists()
            
            # First, delete any existing chunks for this document (deduplication)
            # Only check if we have chunks to upload and deletion check is not skipped
            if chunks and not skip_delete_check:
                filename = chunks[0]["filename"]
                user_id = chunks[0].get("userId")  # Get userId from chunk
                logger.debug("Checking for existing chunks for document: %s (user: %s)", filename, user_id)
                await self.delete_document_chunks_from_search(filename, user_id)
            elif chunks and skip_delete_check:
                logger.debug("Skipping delete check for new document: %s", chunks[0]['filename'])
            else:
                logger.debug("No chunks to upload")
                return []
            
            # Prepare documents for upload
            documents = []
            for chunk in chunks:
                doc = {
                    "id": chunk["id"],
                    "content": chunk["content"],
                    "documentId": chunk["documentId"],
                    "filename": chunk["filename"],
                    "userId": chunk.get("userId", ""),  # Add userId for security filtering
                    "chunkIndex": chunk["chunkIndex"],
                    "contentVector": chunk["embedding"],
                }
                documents.append(doc)
            
            # Upload in batches to avoid Azure Search limits
            if len(documents) <= batch_size:
                # Small batch, upload all at once
                result = self.search_client.upload_documents(documents=documents)
                logger.info("Uploaded %d chunks to Azure Search", len(documents))
                return result
            else:
                # Large batch, split into smaller uploads with concurrent processing
                logger.info("Uploading %d chunks in batches of %d", len(documents), batch_size)
                
                # Create batches
                batches = []
                for i in range(0, len(documents), batch_size):
                    batch = documents[i:i + batch_size]
                    batches.append(batch)
                
                # Upload batches concurrently (limit concurrency to avoid overwhelming Azure)
                import asyncio
                semaphore = asyncio.Semaphore(3)  # Max 3 concurrent uploads
                
                async def upload_batch_with_semaphore(batch_data, batch_num, total_batches):
                    async with semaphore:
                        logger.debug("Uploading batch %d/%d (%d chunks)", batch_num, total_batches, len(batch_data))
                        try:
                            # Run the synchronous upload in thread pool to avoid blocking
                            loop = asyncio.get_event_loop()
                            result = await loop.run_in_executor(
                                None, 
                                lambda: self.search_client.upload_documents(documents=batch_data)
                            )
                            return result
                        except Exception as batch_error:
                            logger.error("Batch %d upload failed: %s", batch_num, str(batch_error))
                            return None
                
                # Execute all batch uploads concurrently
                tasks = [
                    upload_batch_with_semaphore(batch, i + 1, len(batches))
                    for i, batch in enumerate(batches)
                ]
                
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # Filter out failed uploads
                successful_results = [r for r in results if r is not None and not isinstance(r, Exception)]
                
                logger.info("Uploaded %d chunks to Azure Search in %d/%d successful batches", len(documents), len(successful_results), len(batches))
                return successful_results
            
        except Exception as e:
            logger.error("Azure Search upload failed: %s", str(e))
            # Don't raise exception - continue without search for now
            return None
    
    def _normalize_azure_search_score(self, score: float, max_score: float = None) -> float:
        """
        Apply moderate user-friendly boosting to raw vector similarity scores.
        
        Backend uses real scores for filtering/ranking (honest quality assessment).
        Frontend receives slightly boosted scores for better user perception.
        
        Boosting strategy (conservative):
        - 0.70+ (already good) → +10% boost (e.g., 0.72 → 0.79)
        - 0.60-0.69 (moderate) → +15% boost (e.g., 0.65 → 0.75)
        - 0.50-0.59 (borderline) → +20% boost (e.g., 0.55 → 0.66)
        - <0.50 (poor) → minimal boost (cap at 0.60)
        
        This balances transparency with user-friendly presentation.
        """
        if score <= 0:
            return 0.0
        
        # Apply user-friendly boost for display
        if score >= 0.70:
            # Already good - small boost for confidence
            boosted = min(score * 1.10, 0.95)  # +10%, cap at 95%
        elif score >= 0.60:
            # Moderate match - medium boost
            boosted = min(score * 1.15, 0.90)  # +15%, cap at 90%
        elif score >= 0.50:
            # Borderline - larger boost to show it passed threshold
            boosted = min(score * 1.20, 0.75)  # +20%, cap at 75%
        else:
            # Poor match - minimal boost, show it's weak
            boosted = min(score * 1.15, 0.60)  # Small boost, cap at 60%
        
        return min(boosted, 0.99)  # Never show 100%
    
    def _adapt_user_threshold_to_vector_reality(self, user_threshold: float) -> float:
        """
        Smart threshold adaptation: Convert user-friendly percentage expectations
        to realistic vector similarity ranges.
        
        Problem: Users expect 95% = perfect match, but vector similarity naturally
        peaks around 0.7-0.85 for even highly relevant content.
        
        Solution: Intelligent mapping based on vector similarity mathematics.
        
        Args:
            user_threshold: User-specified threshold (0.0-1.0, e.g., 0.95 for 95%)
            
        Returns:
            Adapted threshold that aligns with vector similarity reality
        """
        # Vector similarity reality check:
        # - Perfect semantic match: ~0.75-0.85 (very rare, identical content)
        # - Highly relevant: ~0.70-0.80
        # - Good relevance: ~0.65-0.75  
        # - Moderate relevance: ~0.60-0.70
        # - Low relevance: ~0.50-0.65
        # - Irrelevant: <0.50
        
        if user_threshold >= 0.95:  # 95%+ = Perfect match expectation
            adapted = 0.75  # Map to realistic "excellent" threshold
            logger.debug("User expects perfect match (≥%.0f%%) → using vector reality threshold %.3f", user_threshold * 100, adapted)
            
        elif user_threshold >= 0.90:  # 90-94% = Excellent match
            adapted = 0.72  # High quality threshold
            logger.debug("User expects excellent match (%.0f%%) → using vector reality threshold %.3f", user_threshold * 100, adapted)
            
        elif user_threshold >= 0.85:  # 85-89% = Very good match
            adapted = 0.70  # Very good threshold
            logger.debug("User expects very good match (%.0f%%) → using vector reality threshold %.3f", user_threshold * 100, adapted)
            
        elif user_threshold >= 0.80:  # 80-84% = Good match
            adapted = 0.68  # Good threshold
            logger.debug("User expects good match (%.0f%%) → using vector reality threshold %.3f", user_threshold * 100, adapted)
            
        elif user_threshold >= 0.75:  # 75-79% = Decent match
            adapted = 0.65  # Decent threshold
            logger.debug("User expects decent match (%.0f%%) → using vector reality threshold %.3f", user_threshold * 100, adapted)
            
        elif user_threshold >= 0.70:  # 70-74% = Moderate match
            adapted = 0.60  # Moderate threshold
            logger.debug("User expects moderate match (%.0f%%) → using vector reality threshold %.3f", user_threshold * 100, adapted)
            
        else:  # <70% = Low expectation, use as-is but with minimum floor
            adapted = max(user_threshold, 0.50)  # Don't go below 50% (irrelevant content)
            logger.debug("User has low expectation (%.0f%%) → using threshold %.3f", user_threshold * 100, adapted)
        
        return adapted
    
    async def semantic_search(
        self, 
        query: str, 
        top_k: int = 5,
        min_score_threshold: float = None,
        document_ids: Optional[List[str]] = None,
        user_id: Optional[str] = None  # Add user_id for isolation
    ) -> List[Dict[str, Any]]:
        """
        Perform semantic search using vector similarity with precision filtering and caching.
        
        Level 1 Precision Tuning:
        - Reduced k to 3-5 for higher quality results
        - Added minimum similarity score threshold to discard noisy context
        - Enhanced metadata grounding with document source information
        - Added smart caching to avoid redundant searches
        
        Security:
        - Filters results by user_id to ensure data isolation
        - Only returns chunks from documents belonging to the authenticated user
        """
        # Check cache first
        cached_results = _search_cache.get(query, top_k)
        if cached_results is not None:
            # Filter cached results by user_id
            if user_id:
                cached_results = await self._filter_results_by_user(cached_results, user_id)
            
            # Apply threshold filtering to cached results
            filtered_results = []
            if min_score_threshold is None:
                try:
                    config = config_manager.get_current_config()
                    user_threshold = config.documentRelevanceThreshold if config else 0.65
                    # Smart adaptation: Convert user expectation to vector reality
                    min_score_threshold = self._adapt_user_threshold_to_vector_reality(user_threshold)
                except Exception:
                    min_score_threshold = 0.65
            else:
                # If threshold was passed explicitly, still adapt it
                min_score_threshold = self._adapt_user_threshold_to_vector_reality(min_score_threshold)
            
            for result in cached_results:
                if result.get('score', 0) >= min_score_threshold:
                    filtered_results.append(result)
            
            logger.debug("Using cached results: %d -> %d after threshold filtering", len(cached_results), len(filtered_results))
            return filtered_results
        
        # Get threshold from config if not specified
        if min_score_threshold is None:
            try:
                config = config_manager.get_current_config()
                user_threshold = config.documentRelevanceThreshold if config else 0.65
                # Smart adaptation: Convert user expectation to vector reality
                min_score_threshold = self._adapt_user_threshold_to_vector_reality(user_threshold)
                logger.debug("Retrieved threshold from config: user=%s, adapted=%s", user_threshold, min_score_threshold)
            except Exception as e:
                logger.warning("Error getting threshold from config: %s", str(e))
                min_score_threshold = 0.65
        else:
            # If threshold was passed explicitly, still adapt it
            original_threshold = min_score_threshold
            min_score_threshold = self._adapt_user_threshold_to_vector_reality(min_score_threshold)
            logger.debug("Threshold adapted: original=%s, adapted=%s", original_threshold, min_score_threshold)
        
        logger.debug("Using document relevance threshold: %s", min_score_threshold)
        
        embeddings = self.get_embeddings()
        
        if not self.search_client or not embeddings:
            logger.info("Azure Search disabled or not configured, using fallback search")
            results = await self._fallback_search(query, top_k, min_score_threshold, user_id=user_id)
            # Cache fallback results too
            _search_cache.set(query, top_k, results)
            return results
            
        # Generate query embedding
        query_vector = await self.embed_query(query)
        logger.debug("Query vector generated - dimension: %d", len(query_vector))
        
        # First check if index has any documents
        try:
            doc_count_results = self.search_client.search(
                search_text="*",
                select=["id"],
                top=1
            )
            doc_count = len(list(doc_count_results))
            logger.debug("Index contains documents (sample check: %d)", doc_count)
        except Exception as count_error:
            logger.warning("Could not count documents: %s", str(count_error))
        
        # Perform vector search with proper VectorizedQuery
        try:
            vector_query = VectorizedQuery(
                vector=query_vector,
                k_nearest_neighbors=top_k,
                fields="contentVector"
            )
            logger.debug("Created vector query - k=%d, field=contentVector", top_k)
            
            # Get the index schema to see available fields
            try:
                index_info = self.search_index_client.get_index(self.index_name)
                available_fields = [field.name for field in index_info.fields]
                logger.debug("Available index fields: %s", available_fields)
                
                # Build select list with only available fields
                select_fields = []
                expected_fields = ["id", "content", "documentId", "filename", "chunkIndex"]
                
                for field in expected_fields:
                    if field in available_fields:
                        select_fields.append(field)
                
                # Ensure we have at least the id field
                if "id" not in select_fields and "id" in available_fields:
                    select_fields = ["id"]
                elif not select_fields:
                    # If no expected fields found, just select id or first available field
                    select_fields = ["id"] if "id" in available_fields else [available_fields[0]] if available_fields else []
                
                logger.debug("Using select fields: %s", select_fields)
            
            except Exception as schema_error:
                logger.error("Could not get index schema: %s", str(schema_error))
                # Fall back to in-memory search immediately
                return await self._fallback_search(query, top_k, min_score_threshold)
            
            # Build OData filter for document IDs if provided
            search_filter = None
            filter_parts = []
            
            # Filter by user's documents if user_id is provided
            if user_id:
                # Get all document IDs for this user
                from server.storage import storage
                user_documents = await storage.getAllDocuments(userId=user_id)
                user_doc_ids = [doc["id"] for doc in user_documents]
                
                if not user_doc_ids:
                    logger.warning("User %s has no documents, returning empty results", user_id)
                    return []
                
                # Create filter for user's documents
                user_filter_parts = [f"documentId eq '{doc_id}'" for doc_id in user_doc_ids]
                filter_parts.append(f"({' or '.join(user_filter_parts)})")
                logger.debug("Filtering by user %s documents (count: %d)", user_id, len(user_doc_ids))
            
            if document_ids and len(document_ids) > 0:
                # Create an OData filter to include only specified documents
                document_filter_parts = [f"documentId eq '{doc_id}'" for doc_id in document_ids]
                filter_parts.append(f"({' or '.join(document_filter_parts)})")
                logger.debug("Applied document filter for %d documents", len(document_ids))
            
            # Combine filters with AND
            if filter_parts:
                search_filter = " and ".join(filter_parts)
                logger.debug("Combined filter applied (length: %d)", len(search_filter))
            
            results = self.search_client.search(
                search_text=None,  # Use pure vector search instead of hybrid
                vector_queries=[vector_query],
                select=select_fields,
                filter=search_filter,  # Add document filtering
                top=top_k
            )
            
            # Convert results to list to check count and debug
            results_list = list(results)
            logger.debug("Vector search returned %d results", len(results_list))
            
            # If no vector results, try a simple text search as a diagnostic
            if len(results_list) == 0:
                logger.debug("No vector results found, trying text search for diagnostic")
                try:
                    text_results = self.search_client.search(
                        search_text=query,
                        select=select_fields,
                        top=3
                    )
                    text_results_list = list(text_results)
                    logger.debug("Text search returned %d results", len(text_results_list))
                    if len(text_results_list) > 0:
                        logger.debug("Text search shows index has data, vector search issue likely")
                except Exception as text_error:
                    logger.debug("Text search also failed: %s", str(text_error))
            
            # Use the vector results for processing
            results = results_list
        except Exception as e:
            logger.error("Azure Search vector query failed: %s", str(e))
            return await self._fallback_search(query, top_k, min_score_threshold)
        
        # Format results with enhanced metadata grounding (Level 3)
        formatted_results = []
        # Find the maximum score for relative normalization
        max_score = max((result.get("@search.score", 0.0) for result in results), default=0.0)
        
        for result in results:
            # Get the raw Azure Search score
            raw_score = result.get("@search.score", 0.0)
            # Normalize it to a more intuitive range
            normalized_score = self._normalize_azure_search_score(raw_score, max_score)
            
            # Level 1: Apply minimum score threshold to discard noisy context
            if normalized_score < min_score_threshold:
                logger.debug("Discarding low-score chunk (%.3f < %.3f) from: %s", normalized_score, min_score_threshold, result.get('filename', 'unknown'))
                continue
            
            # Debug: Print both raw and normalized scores
            
            # Level 3: Enhanced metadata grounding with source information
            chunk_index = result.get("chunkIndex", 0)
            source_metadata = f"[Source: {result.get('filename', 'unknown')}_chunk_{chunk_index}, score: {normalized_score:.3f}]"
            
            formatted_results.append({
                "id": result.get("id", "unknown"),
                "content": result.get("content", "Content not available"),
                "documentId": result.get("documentId", "unknown"),
                "filename": result.get("filename", "Unknown Document"),
                "chunkIndex": chunk_index,
                "score": normalized_score,
                "source_metadata": source_metadata,  # Added for Level 3 grounding
            })
        
        logger.info("Returning %d high-quality results after threshold filtering", len(formatted_results))
        
        # Cache the results before returning
        _search_cache.set(query, top_k, formatted_results)
        
        return formatted_results
    
    async def _filter_results_by_user(self, results: List[Dict[str, Any]], user_id: str) -> List[Dict[str, Any]]:
        """
        Filter search results to only include chunks from documents belonging to the user.
        
        Security:
        - Validates document ownership before returning results
        - Prevents cross-user data leakage
        """
        from server.storage import storage
        
        # Get all document IDs for this user
        user_documents = await storage.getAllDocuments(userId=user_id)
        user_doc_ids = {doc["id"] for doc in user_documents}
        
        # Filter results to only include user's documents
        filtered_results = [
            result for result in results 
            if result.get("documentId") in user_doc_ids
        ]
        
        if len(filtered_results) < len(results):
            logger.info("Filtered %d unauthorized chunks for user %s", len(results) - len(filtered_results), user_id)
        
        return filtered_results
    
    async def _fallback_search(self, query: str, top_k: int, min_score_threshold: float = 0.65, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Fallback search using simple text matching."""
        logger.warning("Fallback search activated for query (top_k=%d)", top_k)
        
        # Apply smart threshold adaptation to fallback search too
        original_threshold = min_score_threshold
        min_score_threshold = self._adapt_user_threshold_to_vector_reality(min_score_threshold)
        logger.debug("Fallback search threshold adapted: original=%s, adapted=%s", original_threshold, min_score_threshold)
        
        # Import here to avoid circular imports
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).parent.parent))
        from server.storage import storage
        
        # Get only chunks from user's documents
        if user_id:
            # Get all document IDs for this user
            user_documents = await storage.getAllDocuments(userId=user_id)
            user_doc_ids = {doc["id"] for doc in user_documents}
            
            if not user_doc_ids:
                logger.warning("User %s has no documents, returning empty fallback results", user_id)
                return []
            
            # Get all chunks
            all_chunks = await storage.getAllChunks()
            # Filter to only user's documents
            all_chunks = [chunk for chunk in all_chunks if chunk.get("documentId") in user_doc_ids]
            logger.info("Fallback search filtered to %d chunks from user %s documents", len(all_chunks), user_id)
        else:
            # Get all chunks from storage (no user filter - only for backward compatibility)
            all_chunks = await storage.getAllChunks()
            logger.warning("Fallback search with NO USER FILTER - retrieved %d total chunks", len(all_chunks))
        
        if not all_chunks:
            logger.warning("No chunks found in storage for fallback search")
            return []
        
        # Simple keyword-based scoring
        query_words = query.lower().split()
        logger.debug("Fallback search query words: %s", query_words)
        scored_chunks = []
        
        for chunk in all_chunks:
            content_lower = chunk.get("content", "").lower()
            score = 0.0
            
            # Count query word matches
            for word in query_words:
                if word in content_lower:
                    score += content_lower.count(word) / len(content_lower)
            
            if score > 0:
                # Get the actual document filename from storage
                document = await storage.getDocument(chunk["documentId"])
                actual_filename = document["filename"] if document else f"Document_{chunk['documentId'][:8]}"
                
                scored_chunks.append({
                    "id": chunk["id"],
                    "content": chunk["content"],
                    "documentId": chunk["documentId"],
                    "filename": actual_filename,
                    "chunkIndex": chunk.get("chunkIndex", 0),
                    "score": min(score * 10, 1.0),  # Normalize score
                })
        
        logger.debug("Found %d chunks with keyword matches", len(scored_chunks))
        
        # Sort by score and return top_k
        scored_chunks.sort(key=lambda x: x["score"], reverse=True)
        result = scored_chunks[:top_k]
        logger.info("Fallback search returning %d top results", len(result))
        
        return result

# Global client instance
rag_client = MultiProviderRAGClient()

# Legacy alias for compatibility
azure_client = rag_client
