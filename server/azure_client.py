"""Multi-provider RAG client with configuration management."""
import os
import hashlib
import json
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
                print(f"[SEARCH_CACHE] Cache HIT for query hash: {cache_key[:8]}...")
                return cached_data
            else:
                # Remove expired entry
                del self.cache[cache_key]
                print(f"[SEARCH_CACHE] Cache EXPIRED for query hash: {cache_key[:8]}...")
        
        print(f"[SEARCH_CACHE] Cache MISS for query hash: {cache_key[:8]}...")
        return None
    
    def set(self, query: str, top_k: int, results: List[Dict[str, Any]]):
        """Cache search results."""
        cache_key = self._get_cache_key(query, top_k)
        
        # Simple LRU: remove oldest if at max size
        if len(self.cache) >= self.max_size:
            oldest_key = min(self.cache.keys(), key=lambda k: self.cache[k][1])
            del self.cache[oldest_key]
            print(f"[SEARCH_CACHE] Evicted oldest entry: {oldest_key[:8]}...")
        
        self.cache[cache_key] = (results, datetime.now())
        print(f"[SEARCH_CACHE] Cached {len(results)} results for query hash: {cache_key[:8]}...")
    
    def clear(self):
        """Clear all cached results."""
        self.cache.clear()
        print("[SEARCH_CACHE] Cache cleared")

# Global cache instance
_search_cache = SearchCache(ttl_minutes=5, max_size=50)  # 5 min TTL, 50 queries max

class MultiProviderRAGClient:
    """Multi-provider RAG client with dynamic configuration."""
    
    def __init__(self):
        # Azure Search configuration (still using env for now)
        self.search_endpoint = os.getenv("AZURE_SEARCH_ENDPOINT")
        self.search_key = os.getenv("AZURE_SEARCH_API_KEY")
        self.index_name = os.getenv("AZURE_SEARCH_INDEX_NAME", "rag-documents")
        
        # Debug: Print Azure Search configuration
        print(f"[RAG_CLIENT] Azure Search config: endpoint={bool(self.search_endpoint)}, key={bool(self.search_key)}, index={self.index_name}")
        
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
                print(f"[RAG_CLIENT] Azure Search clients initialized for index: {self.index_name}")
                # Note: azure_search_enabled will be set to True only after successful upload
            except Exception as e:
                print(f"Warning: Failed to initialize Azure Search client: {e}")
                self.search_index_client = None
                self.search_client = None
        else:
            print(f"[RAG_CLIENT] Azure Search not configured: endpoint={self.search_endpoint is not None}, key={self.search_key is not None}")
        
        # Level 4: Enhanced text splitter with optimal chunk overlap (100-150 tokens)
        # Assuming ~4 chars per token, 100-150 tokens ≈ 400-600 characters
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=500,  # Increased from 200 to 500 for better context continuity
            length_function=len,
            separators=["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " ", ""]  # Better sentence boundaries
        )
    
    def get_llm(self):
        """Get the current LLM instance based on configuration."""
        try:
            return get_llm()
        except Exception as e:
            print(f"[RAG_CLIENT] Error getting LLM: {e}")
            return None
    
    def get_embeddings(self):
        """Get the current embeddings instance based on configuration."""
        try:
            return get_embeddings()
        except Exception as e:
            print(f"[RAG_CLIENT] Error getting embeddings: {e}")
            return None
    
    def reload_providers(self):
        """Reload providers when configuration changes."""
        reset_providers()
        print("[RAG_CLIENT] Reloaded all providers due to configuration change")
    
    async def ensure_index_exists(self):
        """Create search index if it doesn't exist."""
        if not self.search_index_client:
            print("[RAG_CLIENT] Azure Search index client not available, cannot create index")
            return False
            
        try:
            # Try to get existing index
            existing_index = self.search_index_client.get_index(self.index_name)
            print(f"[RAG_CLIENT] Index '{self.index_name}' already exists")
            return True
        except Exception:
            print(f"[RAG_CLIENT] Index '{self.index_name}' does not exist, creating it...")
            
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
                print(f"[RAG_CLIENT] Successfully created index '{self.index_name}'")
                return True
                
            except Exception as create_error:
                print(f"[RAG_CLIENT] Failed to create index: {create_error}")
                return False
    
    async def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a list of texts."""
        embeddings = self.get_embeddings()
        if not embeddings:
            raise ValueError("Embeddings provider not configured")
        return await embeddings.aembed_documents(texts)
    
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
    
    async def delete_document_chunks_from_search(self, filename: str):
        """Delete all chunks for a document from Azure Cognitive Search by filename."""
        if not self.search_client:
            print("[DEBUG] Azure Search not configured, skipping deletion")
            return
            
        try:
            await self.ensure_index_exists()
            
            # Search for existing chunks with this filename
            print(f"[DEBUG] Searching for existing chunks with filename: {filename}")
            search_results = self.search_client.search(
                search_text="*",
                filter=f"filename eq '{filename}'",
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
                print(f"[DEBUG] Found {count} existing chunks to delete for {filename}")
                # Delete existing chunks
                delete_result = self.search_client.delete_documents(documents=docs_to_delete)
                print(f"[DEBUG] Successfully deleted {count} existing chunks for {filename}")
                return delete_result
            else:
                print(f"[DEBUG] No existing chunks found for {filename}")
                return None
                
        except Exception as e:
            print(f"[DEBUG] Failed to delete existing chunks for {filename}: {e}")
            # Don't raise exception - continue with upload
            return None

    async def upload_chunks_to_search(
        self, 
        chunks: List[Dict[str, Any]]
    ):
        """Upload document chunks with embeddings to Azure Cognitive Search."""
        if not self.search_client:
            print("[DEBUG] Azure Search not configured, skipping upload")
            return
            
        try:
            await self.ensure_index_exists()
            
            # First, delete any existing chunks for this document (deduplication)
            if chunks:
                filename = chunks[0]["filename"]
                print(f"[DEBUG] Checking for existing chunks for document: {filename}")
                await self.delete_document_chunks_from_search(filename)
            
            # Prepare documents for upload
            documents = []
            for chunk in chunks:
                doc = {
                    "id": chunk["id"],
                    "content": chunk["content"],
                    "documentId": chunk["documentId"],
                    "filename": chunk["filename"],
                    "chunkIndex": chunk["chunkIndex"],
                    "contentVector": chunk["embedding"],
                }
                documents.append(doc)
            
            # Upload in batches
            result = self.search_client.upload_documents(documents=documents)
            print(f"[DEBUG] Successfully uploaded {len(documents)} chunks to Azure Search")
            return result
            
        except Exception as e:
            print(f"[DEBUG] Azure Search upload failed: {e}")
            print("[DEBUG] Continuing without search index for testing")
            # Don't raise exception - continue without search for now
            return None
    
    def _normalize_azure_search_score(self, score: float, max_score: float = None) -> float:
        """
        Normalize Azure Search scores to a user-friendly percentage.
        For vector similarity scores (0-1 range), we interpret them as direct similarity percentages.
        For hybrid search scores (typically 0.01-0.05), we scale them up appropriately.
        """
        if score <= 0:
            return 0.0
        
        # Detect if this is a vector similarity score (typically 0.5-1.0 range for good matches)
        # vs hybrid search score (typically 0.01-0.05 range)
        
        if score > 0.1:  # This is likely a vector similarity score
            # Vector similarity scores are already in a meaningful 0-1 range
            # Convert directly to percentage, with slight scaling to make good scores more apparent
            if score >= 0.95:  # Perfect match
                return 0.99
            elif score >= 0.80:  # Excellent match
                return min(0.95, score * 1.05)  # Slight boost for display
            elif score >= 0.60:  # Very good match
                return min(0.90, score * 1.1)   # Small boost for display
            elif score >= 0.40:  # Good match
                return min(0.75, score * 1.2)   # Moderate boost for display
            elif score >= 0.20:  # Fair match
                return min(0.60, score * 1.5)   # Larger boost for lower scores
            else:  # Poor match
                return min(0.40, score * 2.0)   # Maximum boost for very low scores
        else:
            # This is likely a hybrid search score - scale up significantly
            if score >= 0.04:  # Excellent match
                return min(0.95, score * 20)  # Cap at 95%
            elif score >= 0.03:  # Very good match  
                return min(0.80, score * 25)
            elif score >= 0.02:  # Good match
                return min(0.65, score * 30)
            elif score >= 0.01:  # Fair match
                return min(0.50, score * 35)
            else:  # Poor match
                return min(0.30, score * 40)
    
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
            print(f"[THRESHOLD] User expects perfect match (≥{user_threshold:.0%}) → Using vector reality threshold {adapted:.3f}")
            
        elif user_threshold >= 0.90:  # 90-94% = Excellent match
            adapted = 0.72  # High quality threshold
            print(f"[THRESHOLD] User expects excellent match ({user_threshold:.0%}) → Using vector reality threshold {adapted:.3f}")
            
        elif user_threshold >= 0.85:  # 85-89% = Very good match
            adapted = 0.70  # Very good threshold
            print(f"[THRESHOLD] User expects very good match ({user_threshold:.0%}) → Using vector reality threshold {adapted:.3f}")
            
        elif user_threshold >= 0.80:  # 80-84% = Good match
            adapted = 0.68  # Good threshold
            print(f"[THRESHOLD] User expects good match ({user_threshold:.0%}) → Using vector reality threshold {adapted:.3f}")
            
        elif user_threshold >= 0.75:  # 75-79% = Decent match
            adapted = 0.65  # Decent threshold
            print(f"[THRESHOLD] User expects decent match ({user_threshold:.0%}) → Using vector reality threshold {adapted:.3f}")
            
        elif user_threshold >= 0.70:  # 70-74% = Moderate match
            adapted = 0.60  # Moderate threshold
            print(f"[THRESHOLD] User expects moderate match ({user_threshold:.0%}) → Using vector reality threshold {adapted:.3f}")
            
        else:  # <70% = Low expectation, use as-is but with minimum floor
            adapted = max(user_threshold, 0.50)  # Don't go below 50% (irrelevant content)
            print(f"[THRESHOLD] User has low expectation ({user_threshold:.0%}) → Using threshold {adapted:.3f}")
        
        return adapted
    
    async def semantic_search(
        self, 
        query: str, 
        top_k: int = 5,
        min_score_threshold: float = None
    ) -> List[Dict[str, Any]]:
        """
        Perform semantic search using vector similarity with precision filtering and caching.
        
        Level 1 Precision Tuning:
        - Reduced k to 3-5 for higher quality results
        - Added minimum similarity score threshold to discard noisy context
        - Enhanced metadata grounding with document source information
        - Added smart caching to avoid redundant searches
        """
        # Check cache first
        cached_results = _search_cache.get(query, top_k)
        if cached_results is not None:
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
            
            print(f"[DEBUG] Using cached results: {len(cached_results)} -> {len(filtered_results)} after threshold")
            return filtered_results
        
        # Get threshold from config if not specified
        if min_score_threshold is None:
            try:
                config = config_manager.get_current_config()
                user_threshold = config.documentRelevanceThreshold if config else 0.65
                # Smart adaptation: Convert user expectation to vector reality
                min_score_threshold = self._adapt_user_threshold_to_vector_reality(user_threshold)
                print(f"[DEBUG] Retrieved threshold from config: {user_threshold}, adapted to vector reality: {min_score_threshold}, config source: {config.source if config else 'none'}")
            except Exception as e:
                print(f"[DEBUG] Error getting threshold from config: {e}")
                min_score_threshold = 0.65
        else:
            # If threshold was passed explicitly, still adapt it
            original_threshold = min_score_threshold
            min_score_threshold = self._adapt_user_threshold_to_vector_reality(min_score_threshold)
            print(f"[DEBUG] Threshold passed explicitly: {original_threshold}, adapted to vector reality: {min_score_threshold}")
        
        print(f"[DEBUG] Using adapted document relevance threshold: {min_score_threshold}")
        
        embeddings = self.get_embeddings()
        
        if not self.search_client or not embeddings:
            print("[DEBUG] Azure Search disabled or not configured, using fallback search")
            results = await self._fallback_search(query, top_k, min_score_threshold)
            # Cache fallback results too
            _search_cache.set(query, top_k, results)
            return results
            
        # Generate query embedding
        query_vector = await self.embed_query(query)
        print(f"[DEBUG] Query vector generated - dimension: {len(query_vector)}")
        
        # First check if index has any documents
        try:
            doc_count_results = self.search_client.search(
                search_text="*",
                select=["id"],
                top=1
            )
            doc_count = len(list(doc_count_results))
            print(f"[DEBUG] Index contains {doc_count} documents (checking first result)")
        except Exception as count_error:
            print(f"[DEBUG] Could not count documents: {count_error}")
        
        # Perform vector search with proper VectorizedQuery
        try:
            vector_query = VectorizedQuery(
                vector=query_vector,
                k_nearest_neighbors=top_k,
                fields="contentVector"
            )
            print(f"[DEBUG] Created vector query - k: {top_k}, field: contentVector")
            
            # Get the index schema to see available fields
            try:
                index_info = self.search_index_client.get_index(self.index_name)
                available_fields = [field.name for field in index_info.fields]
                print(f"[DEBUG] Available fields from index schema: {available_fields}")
                
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
                
                print(f"[DEBUG] Using select fields based on schema: {select_fields}")
            
            except Exception as schema_error:
                print(f"[DEBUG] Could not get index schema: {schema_error}")
                print("[DEBUG] Azure Search index may not exist or be accessible")
                # Fall back to in-memory search immediately
                return await self._fallback_search(query, top_k, min_score_threshold)
            
            results = self.search_client.search(
                search_text=None,  # Use pure vector search instead of hybrid
                vector_queries=[vector_query],
                select=select_fields,
                top=top_k
            )
            
            print(f"[DEBUG] Azure Search returned results successfully")
            
            # Convert results to list to check count and debug
            results_list = list(results)
            print(f"[DEBUG] Vector search returned {len(results_list)} results")
            
            # If no vector results, try a simple text search as a diagnostic
            if len(results_list) == 0:
                print(f"[DEBUG] No vector results found, trying simple text search for diagnostic...")
                try:
                    text_results = self.search_client.search(
                        search_text=query,
                        select=select_fields,
                        top=3
                    )
                    text_results_list = list(text_results)
                    print(f"[DEBUG] Simple text search returned {len(text_results_list)} results")
                    if len(text_results_list) > 0:
                        print(f"[DEBUG] Text search shows index has data, vector search issue likely")
                        for i, result in enumerate(text_results_list[:2]):
                            print(f"[DEBUG] Text result {i}: ID={result.get('id', 'unknown')[:8]}..., filename={result.get('filename', 'unknown')}")
                except Exception as text_error:
                    print(f"[DEBUG] Text search also failed: {text_error}")
            
            # Use the vector results for processing
            results = results_list
        except Exception as e:
            print(f"[DEBUG] Azure Search vector query failed: {e}")
            print("[DEBUG] Falling back to in-memory search")
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
                print(f"[DEBUG] Discarding chunk due to low score ({normalized_score:.3f} < {min_score_threshold}): {result.get('filename', 'unknown')}")
                continue
            
            # Debug: Print both raw and normalized scores
            #print(f"[DEBUG] Azure Search result - ID: {result.get('id', 'unknown')[:8]}..., Raw Score: {raw_score:.6f}, Normalized: {normalized_score:.3f}")
            
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
        
        print(f"[DEBUG] Returning {len(formatted_results)} high-quality results (after threshold filter) with scores: {[r['score'] for r in formatted_results]}")
        
        # Cache the results before returning
        _search_cache.set(query, top_k, formatted_results)
        
        return formatted_results
    
    async def _fallback_search(self, query: str, top_k: int, min_score_threshold: float = 0.65) -> List[Dict[str, Any]]:
        """Fallback search using simple text matching."""
        print(f"[DEBUG] FALLBACK SEARCH CALLED for query: '{query}', top_k: {top_k}")
        print(f"[DEBUG] This should NOT be called if Azure Search is working!")
        
        # Apply smart threshold adaptation to fallback search too
        original_threshold = min_score_threshold
        min_score_threshold = self._adapt_user_threshold_to_vector_reality(min_score_threshold)
        print(f"[DEBUG] Fallback search - original threshold: {original_threshold}, adapted: {min_score_threshold}")
        
        # Import here to avoid circular imports
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).parent.parent))
        from server.storage import storage
        
        # Get all chunks from storage
        all_chunks = await storage.getAllChunks()
        print(f"[DEBUG] Retrieved {len(all_chunks)} chunks from storage")
        
        if not all_chunks:
            print("[DEBUG] No chunks found in storage")
            return []
        
        # Log first chunk for debugging
        if all_chunks:
            first_chunk = all_chunks[0]
            print(f"[DEBUG] First chunk: ID={first_chunk.get('id', 'N/A')}, content length={len(first_chunk.get('content', ''))}")
        
        # Simple keyword-based scoring
        query_words = query.lower().split()
        print(f"[DEBUG] Query words: {query_words}")
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
        
        print(f"[DEBUG] Found {len(scored_chunks)} chunks with matches")
        
        # Sort by score and return top_k
        scored_chunks.sort(key=lambda x: x["score"], reverse=True)
        result = scored_chunks[:top_k]
        print(f"[DEBUG] Returning {len(result)} top results")
        
        return result

# Global client instance
rag_client = MultiProviderRAGClient()

# Legacy alias for compatibility
azure_client = rag_client
