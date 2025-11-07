"""Query Refinement Agent for generating related questions using the 5-question technique."""

from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field
import hashlib
import json

from server.providers import get_llm
from server.storage import storage


class QueryRefinementCache(BaseModel):
    """Cache entry for refined queries."""
    session_id: str
    original_query: str
    query_hash: str
    refined_queries: List[str]
    query_category: str
    created_at: datetime
    reuse_count: int = 0
    last_reused_at: Optional[datetime] = None


class QueryRefinement(BaseModel):
    """Query refinement output structure."""
    original_query: str = Field(description="The original user query")
    refined_queries: List[str] = Field(description="5 related questions for deeper exploration")
    query_category: str = Field(description="Category of the query (temporal, factual, counterfactual)")
    refinement_reasoning: str = Field(description="Why these specific questions were chosen")
    was_cached: bool = Field(default=False, description="Whether this result was retrieved from cache")
    cache_similarity: float = Field(default=0.0, description="Similarity score with cached query")
    cost_savings: Dict[str, Any] = Field(default_factory=dict, description="Cost optimization metrics")


class QueryRefinementAgent:
    """Agent for generating related questions to improve query understanding."""
    
    def __init__(self):
        self.name = "query_refinement"
        self.query_cache: Dict[str, QueryRefinementCache] = {}  # session_id -> cache entries
        self.similarity_threshold = 0.7  # Threshold for query reuse
        self.cache_expiry_hours = 24  # Cache expiry time
        self.max_cache_per_session = 10  # Max cached queries per session
        self._setup_prompt()
    
    def _setup_prompt(self):
        """Initialize the query refinement prompt."""
        self.refinement_prompt = ChatPromptTemplate.from_template("""
You are an expert in query understanding and intent expansion.  
Your goal is to generate 5 **contextually relevant** and **natural-sounding** alternate questions that reflect the same intent as the user’s original query.

**Original Query**: "{query}"

### TASK
Create 5 semantically related questions that explore the topic from different useful angles.  
These will help an AI retriever or user discover more comprehensive results.

### GUIDELINES
- **Preserve intent:** Keep the same core meaning, only vary phrasing or focus.  
- **Match difficulty:** Maintain the same complexity level as the original.  
- **Stay useful:** Each variant should be something a real user might ask next.  
- **Avoid noise:** Don’t add unrelated or overly academic questions.  
- **Use natural tone:** Questions should sound like genuine user queries.

### QUESTION TYPES
1. **Immediate follow-up** – small extension of the original  
2. **Practical application** – how it’s used or applied  
3. **Common variation** – alternate phrasing or scope  
4. **Problem-solving** – addressing challenges or errors  
5. **Next step** – what to explore after understanding this

### EXAMPLE (Basic)
Original: "What is a palindrome and give me an example in Python?"
Output:
1. How do you check if a string is a palindrome in Python?  
2. What are some other examples of palindromes besides words?  
3. How can you ignore spaces and punctuation when checking palindromes?  
4. What’s the difference between checking palindromes for strings vs numbers?  
5. How do you reverse a string in Python to compare with the original?

### RESPONSE FORMAT (JSON)
**IMPORTANT: Return only valid JSON. No comments, no code blocks, no markdown.**

{{
  "original_query": "{query}",
  "refined_queries": [
    "Question 1 - immediate follow-up",
    "Question 2 - practical application", 
    "Question 3 - common variation",
    "Question 4 - problem-solving",
    "Question 5 - next step"
  ],
  "query_category": "factual|procedural|comparative|temporal|counterfactual",
  "refinement_reasoning": "Brief explanation of how these variations help cover different dimensions of the same intent."
}}

**DO NOT include any comments (//) or code blocks (```) in your JSON response.**
""")

    def _generate_query_hash(self, query: str) -> str:
        """Generate a hash for the query to use as cache key."""
        # Normalize query for better matching
        normalized = query.lower().strip()
        return hashlib.md5(normalized.encode()).hexdigest()[:16]
    
    def _calculate_query_similarity(self, query1: str, query2: str) -> float:
        """Calculate similarity between two queries using word overlap."""
        def get_words(text: str) -> set:
            return set(text.lower().split())
        
        words1 = get_words(query1)
        words2 = get_words(query2)
        
        if not words1 or not words2:
            return 0.0
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        return len(intersection) / len(union) if union else 0.0
    
    def _find_similar_cached_query(self, query: str, session_id: str) -> Optional[Tuple[QueryRefinementCache, float]]:
        """Find a similar cached query for the session."""
        if session_id not in self.query_cache:
            return None
        
        best_match = None
        best_similarity = 0.0
        
        cached_entries = self.query_cache[session_id]
        current_time = datetime.now()
        
        # Check all cached entries for this session
        for entry in cached_entries:
            # Skip expired entries
            if (current_time - entry.created_at).total_seconds() > (self.cache_expiry_hours * 3600):
                continue
            
            similarity = self._calculate_query_similarity(query, entry.original_query)
            
            if similarity > best_similarity and similarity >= self.similarity_threshold:
                best_similarity = similarity
                best_match = entry
        
        return (best_match, best_similarity) if best_match else None
    
    def _cache_query_refinement(self, session_id: str, refinement: QueryRefinement) -> None:
        """Cache a query refinement result."""
        if session_id not in self.query_cache:
            self.query_cache[session_id] = []
        
        cache_entry = QueryRefinementCache(
            session_id=session_id,
            original_query=refinement.original_query,
            query_hash=self._generate_query_hash(refinement.original_query),
            refined_queries=refinement.refined_queries,
            query_category=refinement.query_category,
            created_at=datetime.now()
        )
        
        # Add to cache
        self.query_cache[session_id].append(cache_entry)
        
        # Limit cache size per session
        if len(self.query_cache[session_id]) > self.max_cache_per_session:
            # Remove oldest entry
            self.query_cache[session_id].pop(0)
    
    def _update_cache_reuse_stats(self, cache_entry: QueryRefinementCache) -> None:
        """Update cache reuse statistics."""
        cache_entry.reuse_count += 1
        cache_entry.last_reused_at = datetime.now()
    
    def _clean_expired_cache_entries(self) -> int:
        """Clean up expired cache entries across all sessions."""
        current_time = datetime.now()
        cleaned_count = 0
        
        for session_id in list(self.query_cache.keys()):
            entries = self.query_cache[session_id]
            valid_entries = []
            
            for entry in entries:
                if (current_time - entry.created_at).total_seconds() <= (self.cache_expiry_hours * 3600):
                    valid_entries.append(entry)
                else:
                    cleaned_count += 1
            
            if valid_entries:
                self.query_cache[session_id] = valid_entries
            else:
                del self.query_cache[session_id]
        
        return cleaned_count

    
    async def generate_related_questions(
        self, 
        query: str, 
        session_id: Optional[str] = None,
        force_regenerate: bool = False
    ) -> QueryRefinement:
        """
        Generate 5 related questions for the given query with smart caching.
        
        Args:
            query: The original user query
            session_id: Session ID for caching (if None, no caching)
            force_regenerate: Force regeneration even if cached result exists
            
        Returns:
            QueryRefinement with related questions and metadata
        """
        start_time = datetime.now()
        
        # Check cache first (if session_id provided and not forcing regeneration)
        if session_id and not force_regenerate:
            cached_result = self._find_similar_cached_query(query, session_id)
            if cached_result:
                cache_entry, similarity = cached_result
                
                # Update cache statistics
                self._update_cache_reuse_stats(cache_entry)
                
                print(f"[QUERY_REFINEMENT] Using cached result (similarity: {similarity:.2f})")
                
                # Return cached result with metadata
                return QueryRefinement(
                    original_query=query,
                    refined_queries=cache_entry.refined_queries,
                    query_category=cache_entry.query_category,
                    refinement_reasoning=f"Reused cached refinement (similarity: {similarity:.2f}, reuse_count: {cache_entry.reuse_count})",
                    was_cached=True,
                    cache_similarity=similarity,
                    cost_savings={
                        "llm_calls_saved": 1,
                        "cache_reuse_count": cache_entry.reuse_count,
                        "processing_time_ms": int((datetime.now() - start_time).total_seconds() * 1000),
                        "cache_hit": True
                    }
                )
        
        # Generate new refinement
        try:
            llm = get_llm()
            if not llm:
                return self._fallback_refinement(query)
            
            # First try with the structured parser
            parser = JsonOutputParser(pydantic_object=QueryRefinement)
            chain = self.refinement_prompt | llm | parser
            
            result = await chain.ainvoke({"query": query})
            
            # Create refinement object with cost tracking
            refinement = QueryRefinement(
                **result,
                was_cached=False,
                cache_similarity=0.0,
                cost_savings={
                    "llm_calls_saved": 0,
                    "cache_reuse_count": 0,
                    "processing_time_ms": int((datetime.now() - start_time).total_seconds() * 1000),
                    "cache_hit": False,
                    "generated_fresh": True
                }
            )
            
            # Cache the result for future use
            if session_id:
                self._cache_query_refinement(session_id, refinement)
                print(f"[QUERY_REFINEMENT] Cached new refinement for session {session_id}")
            
            return refinement
            
        except Exception as e:
            error_msg = str(e)
            print(f"Query Refinement error: {error_msg}")
            
            # Check if this is an API error - if so, don't generate fallback questions
            if self._is_api_error(error_msg):
                print("[QUERY_REFINEMENT] API error detected - skipping question generation")
                
                # Determine specific error type for better downstream handling
                if "401" in error_msg and "api" in error_msg.lower():
                    error_type = "api_authentication_failed"
                    reasoning = f"API authentication failed - {error_type}"
                elif "429" in error_msg and ("quota" in error_msg.lower() or "rate limit" in error_msg.lower()):
                    error_type = "api_quota_exceeded"
                    reasoning = f"API quota exceeded - {error_type}"
                else:
                    error_type = "api_connection_error"
                    reasoning = f"API connection error - {error_type}"
                
                # Return minimal refinement that indicates API failure with specific error type
                return QueryRefinement(
                    original_query=query,
                    refined_queries=[query],  # Only return original query
                    query_category="api_error",
                    refinement_reasoning=reasoning,
                    was_cached=False,
                    cache_similarity=0.0,
                    cost_savings={
                        "llm_calls_saved": 0,
                        "cache_reuse_count": 0,
                        "processing_time_ms": int((datetime.now() - start_time).total_seconds() * 1000),
                        "cache_hit": False,
                        "api_error": True
                    }
                )
            
            # Try alternative approach with raw LLM response cleaning for non-API errors
            try:
                llm = get_llm()
                if llm:
                    print("[QUERY_REFINEMENT] Attempting JSON cleanup...")
                    raw_response = await llm.ainvoke(self.refinement_prompt.format(query=query))
                    cleaned_json = self._clean_json_response(raw_response.content)
                    
                    import json
                    parsed_data = json.loads(cleaned_json)
                    
                    refinement = QueryRefinement(
                        **parsed_data,
                        was_cached=False,
                        cache_similarity=0.0,
                        cost_savings={
                            "llm_calls_saved": 0,
                            "cache_reuse_count": 0,
                            "processing_time_ms": int((datetime.now() - start_time).total_seconds() * 1000),
                            "cache_hit": False,
                            "generated_fresh": True,
                            "required_cleanup": True
                        }
                    )
                    
                    # Cache the result
                    if session_id:
                        self._cache_query_refinement(session_id, refinement)
                    
                    return refinement
                    
            except Exception as cleanup_error:
                print(f"[QUERY_REFINEMENT] JSON cleanup failed: {cleanup_error}")
                
                # Check again if cleanup error is also API-related
                if self._is_api_error(str(cleanup_error)):
                    print("[QUERY_REFINEMENT] API error in cleanup - skipping question generation")
                    
                    # Determine specific error type for cleanup errors too
                    cleanup_error_msg = str(cleanup_error)
                    if "401" in cleanup_error_msg and "api" in cleanup_error_msg.lower():
                        error_type = "api_authentication_failed"
                        reasoning = f"API authentication failed - {error_type}"
                    elif "429" in cleanup_error_msg and ("quota" in cleanup_error_msg.lower() or "rate limit" in cleanup_error_msg.lower()):
                        error_type = "api_quota_exceeded"
                        reasoning = f"API quota exceeded - {error_type}"
                    else:
                        error_type = "api_connection_error"
                        reasoning = f"API connection error - {error_type}"
                    
                    return QueryRefinement(
                        original_query=query,
                        refined_queries=[query],
                        query_category="api_error", 
                        refinement_reasoning=reasoning,
                        was_cached=False,
                        cache_similarity=0.0,
                        cost_savings={
                            "llm_calls_saved": 0,
                            "cache_reuse_count": 0,
                            "processing_time_ms": int((datetime.now() - start_time).total_seconds() * 1000),
                            "cache_hit": False,
                            "api_error": True
                        }
                    )
            
            # Only use fallback for non-API errors (like parsing issues)
            fallback_result = self._fallback_refinement(query)
            fallback_result.cost_savings = {
                "llm_calls_saved": 1,  # Saved LLM call by using fallback
                "cache_reuse_count": 0,
                "processing_time_ms": int((datetime.now() - start_time).total_seconds() * 1000),
                "cache_hit": False,
                "used_fallback": True
            }
            
            # Cache fallback result too
            if session_id:
                self._cache_query_refinement(session_id, fallback_result)
            
            return fallback_result
    
    def _clean_json_response(self, response: str) -> str:
        """Clean LLM response to extract valid JSON."""
        import re
        
        # Remove code blocks
        response = re.sub(r'```json\s*', '', response)
        response = re.sub(r'```\s*$', '', response)
        
        # Remove comments
        response = re.sub(r'//.*$', '', response, flags=re.MULTILINE)
        
        # Extract JSON object
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            return json_match.group(0)
        
        return response
    
    def _is_api_error(self, error_message: str) -> bool:
        """Check if the error is related to API issues (quota, auth, connection)."""
        error_lower = error_message.lower()
        
        # API quota/rate limit errors
        if "429" in error_message and ("quota" in error_lower or "rate limit" in error_lower):
            return True
            
        # Authentication errors  
        if "401" in error_message and "api" in error_lower:
            return True
            
        # API connection errors
        if ("openai" in error_lower or "azure" in error_lower) and ("api" in error_lower or "connection" in error_lower):
            return True
            
        # Network/timeout errors
        if any(keyword in error_lower for keyword in ["timeout", "network", "connection", "unreachable"]):
            return True
            
        return False
    
    def _fallback_refinement(self, query: str) -> QueryRefinement:
        """
        Fallback refinement when LLM is unavailable (non-API errors only).
        This generates contextually appropriate questions based on query patterns.
        Note: This is only called for parsing/technical errors, not API issues.
        """
        
        query_lower = query.lower()
        topic = self._extract_main_topic(query)
        
        # Specific patterns for common query types
        if "interview questions" in query_lower:
            # Interview question requests
            subject = topic if topic != "this topic" else "the subject"
            fallback_questions = [
                f"What are the most common {subject} interview questions?",
                f"How do you prepare for {subject} technical interviews?",
                f"What are advanced {subject} interview topics?",
                f"What practical {subject} questions do interviewers ask?",
                f"How do you demonstrate {subject} skills in interviews?"
            ]
        elif "best practices" in query_lower or "how to" in query_lower:
            # Best practices or how-to questions
            fallback_questions = [
                f"What are the key principles of {topic}?",
                f"What common mistakes should be avoided with {topic}?",
                f"How do you implement {topic} effectively?",
                f"What tools are recommended for {topic}?",
                f"How do you troubleshoot {topic} issues?"
            ]
        elif any(word in query_lower for word in ["what is", "what are", "define", "explain"]):
            # Definition/explanation questions
            fallback_questions = [
                f"How do you use {topic} in practice?",
                f"Can you show me a simple example of {topic}?",
                f"What are common use cases for {topic}?",
                f"How do you get started with {topic}?",
                f"What should I know next about {topic}?"
            ]
        elif "compare" in query_lower or "vs" in query_lower or "difference" in query_lower:
            # Comparison questions
            fallback_questions = [
                f"What are the pros and cons of {topic}?",
                f"When should you choose {topic} over alternatives?",
                f"What are the key differences in {topic} approaches?",
                f"How do you decide between {topic} options?",
                f"What factors influence {topic} selection?"
            ]
        elif any(word in query_lower for word in ["features", "capabilities", "functions"]):
            # Feature/capability questions
            fallback_questions = [
                f"What are the core features of {topic}?",
                f"How do you use {topic} features effectively?",
                f"What advanced capabilities does {topic} offer?",
                f"How do you customize {topic} for your needs?",
                f"What's new in the latest {topic} version?"
            ]
        else:
            # General fallback for other question types
            fallback_questions = [
                f"How do you use {topic} effectively?",
                f"What are examples of {topic} in action?",
                f"What are the benefits of {topic}?",
                f"How do you learn more about {topic}?",
                f"What are alternatives to {topic}?"
            ]
        
        return QueryRefinement(
            original_query=query,
            refined_queries=fallback_questions,
            query_category="factual",
            refinement_reasoning=f"Generated contextually appropriate questions for {topic} based on query pattern analysis (LLM parsing error fallback)",
            was_cached=False,
            cache_similarity=0.0,
            cost_savings={
                "llm_calls_saved": 1,  # Saved LLM call by using pattern-based fallback
                "cache_reuse_count": 0,
                "processing_time_ms": 0,  # Will be updated by caller
                "cache_hit": False,
                "used_fallback": True
            }
        )
    
    def _extract_main_topic(self, query: str) -> str:
        """Extract main topic from query using improved heuristics."""
        # Remove question words and common phrases
        words = query.lower().split()
        stop_words = {
            'what', 'how', 'why', 'when', 'where', 'is', 'are', 'can', 'do', 'does', 
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'me', 'i', 'you', 'my', 'give', 'show', 'explain'
        }
        
        # Remove punctuation and filter content words
        content_words = []
        for word in words:
            clean_word = word.strip('.,!?:;()[]{}')
            if clean_word not in stop_words and len(clean_word) > 2:
                content_words.append(clean_word)
        
        if content_words:
            # Take first 2 content words for better topic extraction
            return ' '.join(content_words[:2])
        return "this topic"


    # Cache management methods
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics for monitoring."""
        total_entries = sum(len(entries) for entries in self.query_cache.values())
        total_reuses = sum(entry.reuse_count for entries in self.query_cache.values() for entry in entries)
        
        return {
            "total_sessions": len(self.query_cache),
            "total_cached_queries": total_entries,
            "total_cache_reuses": total_reuses,
            "cache_efficiency": (total_reuses / max(total_entries, 1)) * 100,
            "cache_config": {
                "similarity_threshold": self.similarity_threshold,
                "cache_expiry_hours": self.cache_expiry_hours,
                "max_cache_per_session": self.max_cache_per_session
            }
        }
    
    def clear_session_cache(self, session_id: str) -> bool:
        """Clear cache for a specific session."""
        if session_id in self.query_cache:
            del self.query_cache[session_id]
            return True
        return False
    
    def clear_all_cache(self) -> int:
        """Clear all cached queries."""
        total_cleared = sum(len(entries) for entries in self.query_cache.values())
        self.query_cache.clear()
        return total_cleared
    
    async def cleanup_cache(self) -> Dict[str, int]:
        """Cleanup expired cache entries and return statistics."""
        expired_count = self._clean_expired_cache_entries()
        
        stats = {
            "expired_entries_removed": expired_count,
            "remaining_sessions": len(self.query_cache),
            "remaining_entries": sum(len(entries) for entries in self.query_cache.values())
        }
        
        print(f"[QUERY_REFINEMENT] Cache cleanup: {stats}")
        return stats


# Global instance
query_refinement_agent = QueryRefinementAgent()