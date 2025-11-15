"""Production-grade Retrieval-Aware Query Planning Agent."""
import logging
from typing import List, Dict, Any, Optional, Tuple, Literal
from datetime import datetime, timedelta
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field
import hashlib
import json
import re

from server.providers import get_llm
from server.storage import storage

logger = logging.getLogger(__name__)


class RefinedQuery(BaseModel):
    """A single refined query with explicit retrieval purpose."""
    type: Literal[
        "constraint_add",      # Add scope: time, org, tool, metric, dataset, region
        "synonym_expand",      # Alternate terms, domain slang, ontology words
        "disambiguation",      # Resolve multiple possible meanings
        "troubleshooting",     # Failure/edge cases, limitations, gotchas
        "next_step"           # Best practices, architecture, optimization
    ] = Field(description="The retrieval purpose of this refined query")
    query: str = Field(description="The refined query text")


class QueryRefinementCache(BaseModel):
    """Cache entry for refined queries."""
    session_id: str
    original_query: str
    query_hash: str
    refined_queries: List[RefinedQuery]  # Now stores typed queries
    intent: str
    created_at: datetime
    reuse_count: int = 0
    last_reused_at: Optional[datetime] = None


class QueryRefinement(BaseModel):
    """Production-grade query refinement with typed retrieval strategies."""
    original_query: str = Field(description="The original user query")
    intent: str = Field(description="Router-detected intent label")
    refined: List[RefinedQuery] = Field(
        description="Refined queries with explicit purpose/type"
    )
    reasoning: str = Field(
        description="Why these refinements were chosen and how they help retrieval"
    )
    was_cached: bool = Field(default=False, description="Whether this result was retrieved from cache")
    cache_similarity: float = Field(default=0.0, description="Similarity score with cached query")
    cost_savings: Dict[str, Any] = Field(default_factory=dict, description="Cost optimization metrics")


class QueryRefinementAgent:
    """Production-grade retrieval-aware query planning agent."""
    
    def __init__(self):
        self.name = "query_refinement"
        self.query_cache: Dict[str, List[QueryRefinementCache]] = {}  # session_id -> list of cache entries
        self.similarity_threshold = 0.7  # Threshold for query reuse
        self.cache_expiry_hours = 24  # Cache expiry time
        self.max_cache_per_session = 10  # Max cached queries per session
        self._setup_prompt()
    
    def _setup_prompt(self):
        """Initialize the production-grade refinement prompt."""
        self.refinement_prompt = ChatPromptTemplate.from_template("""You are a Retrieval-Aware Query Planning Agent.

**Goal:**
Generate refined queries that maximize relevant retrieval quality in a RAG system.

**Inputs:**
- User Query: "{query}"
- Detected Intent: "{intent}"
- Conversation Context: {conversation_context}
- Key Entities Found: {entities}
- Retrieval Observations:
  - Average similarity score: {avg_score}
  - Top document categories: {categories}
  - Common missing concepts: {missing_terms}

**Your job:**
Create up to {max_refinements} refined queries, each serving a different retrieval purpose, WITHOUT changing the core intent.

**CRITICAL: Use Conversation Context**
- If the query has pronouns (it, this, that, these) or incomplete references, USE the conversation context to resolve them
- If the conversation shows what topic was discussed previously, incorporate that topic into refined queries
- Make queries self-contained and specific by resolving ambiguous references

**REFINEMENT TYPES (exact type strings):**
1) "constraint_add"   → add useful scope (time, org, tool, dataset, metric, geography)
2) "synonym_expand"   → use synonyms / related domain terms / alternative names
3) "disambiguation"   → clarify what exactly the user means if multiple interpretations are possible
4) "troubleshooting"  → focus on errors, edge-cases, limitations, debugging steps (only if intent suggests it)
5) "next_step"        → ask the logical follow-up that deepens understanding or best practices

**GUIDELINES:**
- Preserve the original intent strictly. Do NOT change the task type (e.g., definition vs. implementation vs. troubleshooting).
- Use conversation context to resolve pronouns and make queries self-contained
- Use key entities whenever they help stay grounded.
- Maximize semantic diversity:
  - "constraint_add" should narrow to a meaningful slice (e.g., tool, time-window, specific scenario).
  - "synonym_expand" should introduce different wording that real users or docs would use.
  - "disambiguation" should explicitly mention the competing meanings if retrieval shows multiple categories.
  - "troubleshooting" should exist ONLY if the intent is process/troubleshooting/verification or clearly implies possible failure modes.
  - "next_step" should represent what an expert would ask immediately after answering the original question.
- Keep queries short, natural, and realistic. Each must look like a human query, not a spec.
- Avoid hallucinating facts, numbers, or specific standards. You may reference generic concepts (e.g., "market-based", "location-based") if they are common in the domain.
- If a particular refinement type does not make sense for this query, omit it instead of forcing something irrelevant.

**OUTPUT FORMAT (JSON ONLY, NO MARKDOWN, NO COMMENTS):**

{{
  "original_query": "{query}",
  "intent": "{intent}",
  "refined": [
    {{
      "type": "constraint_add",
      "query": "..."
    }},
    {{
      "type": "synonym_expand",
      "query": "..."
    }},
    {{
      "type": "disambiguation",
      "query": "..."
    }},
    {{
      "type": "troubleshooting",
      "query": "..."
    }},
    {{
      "type": "next_step",
      "query": "..."
    }}
  ],
  "reasoning": "Explain briefly how each refinement helps retrieval (precision, recall, disambiguation, error coverage, or deeper context). If any type was skipped, explain why."
}}

**Rules:**
- Return valid JSON only.
- If you skip any refinement type, simply omit that object from the 'refined' array and mention it in 'reasoning'.
- Generate EXACTLY {max_refinements} or fewer refinements based on what makes sense.
""")

    def _generate_query_hash(self, query: str) -> str:
        """Generate a hash for the query to use as cache key."""
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
            refined_queries=refinement.refined,
            intent=refinement.intent,
            created_at=datetime.now()
        )
        
        self.query_cache[session_id].append(cache_entry)
        
        # Limit cache size per session
        if len(self.query_cache[session_id]) > self.max_cache_per_session:
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
        intent: str = "factual",
        entities: Optional[List[str]] = None,
        retrieval_stats: Optional[Dict[str, Any]] = None,
        force_regenerate: bool = False,
        max_refinements: int = 5,
        conversation_context: Optional[str] = None
    ) -> QueryRefinement:
        """
        Generate typed refinement queries for retrieval optimization.
        
        Args:
            query: The original user query
            session_id: Session ID for caching (if None, no caching)
            intent: Router-detected intent label (e.g., "definition", "comparison", "temporal")
            entities: Key entities extracted from query (tools, orgs, metrics, etc.)
            retrieval_stats: Optional stats from preview retrieval
                - avg_score: Average similarity score
                - categories: Top document categories
                - missing_terms: Common missing concepts
            force_regenerate: Force regeneration even if cached result exists
            max_refinements: Maximum number of refinements (default: 5, HYBRID: 3)
            conversation_context: Recent conversation history for context-aware refinements
            
        Returns:
            QueryRefinement with typed refined queries
        """
        start_time = datetime.now()
        
        # Check cache first
        if session_id and not force_regenerate:
            cached_result = self._find_similar_cached_query(query, session_id)
            if cached_result:
                cache_entry, similarity = cached_result
                
                self._update_cache_reuse_stats(cache_entry)
                
                logger.info("Using cached refinement (similarity: %.2f)", similarity)
                
                # Limit cached queries to requested number
                limited_refined = cache_entry.refined_queries[:max_refinements]
                
                return QueryRefinement(
                    original_query=query,
                    intent=cache_entry.intent,
                    refined=limited_refined,
                    reasoning=f"Reused cached refinement (similarity: {similarity:.2f}, reuse_count: {cache_entry.reuse_count})",
                    was_cached=True,
                    cache_similarity=similarity,
                    cost_savings={
                        "llm_calls_saved": 1,
                        "cache_reuse_count": cache_entry.reuse_count,
                        "processing_time_ms": int((datetime.now() - start_time).total_seconds() * 1000),
                        "cache_hit": True
                    }
                )
        
        # Extract retrieval stats
        avg_score = retrieval_stats.get("avg_score", 0.0) if retrieval_stats else 0.0
        categories = retrieval_stats.get("categories", []) if retrieval_stats else []
        missing_terms = retrieval_stats.get("missing_terms", []) if retrieval_stats else []
        
        # Generate new refinement
        try:
            llm = get_llm()
            if not llm:
                return self._fallback_refinement(query, intent, max_refinements)
            
            parser = JsonOutputParser(pydantic_object=QueryRefinement)
            chain = self.refinement_prompt | llm | parser
            
            result = await chain.ainvoke({
                "query": query,
                "intent": intent,
                "conversation_context": conversation_context or "No previous conversation",
                "entities": entities or [],
                "avg_score": avg_score,
                "categories": categories,
                "missing_terms": missing_terms,
                "max_refinements": max_refinements
            })
            
            # Limit results to requested number (in case LLM generates more)
            if "refined" in result and len(result["refined"]) > max_refinements:
                result["refined"] = result["refined"][:max_refinements]
            
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
            
            # Cache the result
            if session_id:
                self._cache_query_refinement(session_id, refinement)
                logger.debug("Cached new refinement for session %s", session_id)
            
            return refinement
            
        except Exception as e:
            error_msg = str(e)
            logger.error("Query Refinement error: %s", error_msg)
            
            # Check if this is an API error
            if self._is_api_error(error_msg):
                logger.warning("API error detected - skipping question generation")
                
                if "401" in error_msg and "api" in error_msg.lower():
                    error_type = "api_authentication_failed"
                    reasoning = f"API authentication failed - {error_type}"
                elif "429" in error_msg and ("quota" in error_msg.lower() or "rate limit" in error_msg.lower()):
                    error_type = "api_quota_exceeded"
                    reasoning = f"API quota exceeded - {error_type}"
                else:
                    error_type = "api_connection_error"
                    reasoning = f"API connection error - {error_type}"
                
                return QueryRefinement(
                    original_query=query,
                    intent=intent,
                    refined=[RefinedQuery(type="synonym_expand", query=query)],  # Only return original as synonym_expand
                    reasoning=reasoning,
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
            
            # Try JSON cleanup for non-API errors
            try:
                llm = get_llm()
                if llm:
                    logger.info("Attempting JSON cleanup...")
                    raw_response = await llm.ainvoke(self.refinement_prompt.format(
                        query=query,
                        intent=intent,
                        conversation_context=conversation_context or "No previous conversation",
                        entities=entities or [],
                        avg_score=avg_score,
                        categories=categories,
                        missing_terms=missing_terms,
                        max_refinements=max_refinements
                    ))
                    cleaned_json = self._clean_json_response(raw_response.content)
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
                    
                    if session_id:
                        self._cache_query_refinement(session_id, refinement)
                    
                    return refinement
                    
            except Exception as cleanup_error:
                logger.error("JSON cleanup failed: %s", cleanup_error)
            
            # Fallback for non-API errors
            fallback_result = self._fallback_refinement(query, intent, max_refinements)
            fallback_result.cost_savings = {
                "llm_calls_saved": 1,
                "cache_reuse_count": 0,
                "processing_time_ms": int((datetime.now() - start_time).total_seconds() * 1000),
                "cache_hit": False,
                "used_fallback": True
            }
            
            if session_id:
                self._cache_query_refinement(session_id, fallback_result)
            
            return fallback_result
    
    def _clean_json_response(self, response: str) -> str:
        """Clean LLM response to extract valid JSON."""
        response = re.sub(r'```json\s*', '', response)
        response = re.sub(r'```\s*$', '', response)
        response = re.sub(r'//.*$', '', response, flags=re.MULTILINE)
        
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            return json_match.group(0)
        
        return response
    
    def _is_api_error(self, error_message: str) -> bool:
        """Check if the error is related to API issues."""
        error_lower = error_message.lower()
        
        if "429" in error_message and ("quota" in error_lower or "rate limit" in error_lower):
            return True
        if "401" in error_message and "api" in error_lower:
            return True
        if ("openai" in error_lower or "azure" in error_lower) and ("api" in error_lower or "connection" in error_lower):
            return True
        if any(keyword in error_lower for keyword in ["timeout", "network", "connection", "unreachable"]):
            return True
            
        return False
    
    def _fallback_refinement(self, query: str, intent: str, max_refinements: int = 5) -> QueryRefinement:
        """
        Fallback refinement using heuristics when LLM is unavailable.
        
        Args:
            query: The original user query
            intent: Detected intent
            max_refinements: Number of refinements to generate
        """
        query_lower = query.lower()
        topic = self._extract_main_topic(query)
        
        # Build fallback refinements based on intent
        fallback_refined = []
        
        # 1. constraint_add - always useful
        fallback_refined.append(RefinedQuery(
            type="constraint_add",
            query=f"{query} specific implementation"
        ))
        
        # 2. synonym_expand - always useful
        fallback_refined.append(RefinedQuery(
            type="synonym_expand",
            query=f"How to work with {topic}"
        ))
        
        # 3. disambiguation - if query is ambiguous
        if len(query.split()) < 5 or any(word in query_lower for word in ["what is", "define", "explain"]):
            fallback_refined.append(RefinedQuery(
                type="disambiguation",
                query=f"What exactly is {topic} used for"
            ))
        
        # 4. troubleshooting - if intent suggests issues
        if intent in ["troubleshooting", "process", "verification"] or any(word in query_lower for word in ["error", "issue", "problem", "fix", "debug"]):
            fallback_refined.append(RefinedQuery(
                type="troubleshooting",
                query=f"Common {topic} issues and solutions"
            ))
        
        # 5. next_step - always useful
        fallback_refined.append(RefinedQuery(
            type="next_step",
            query=f"{topic} best practices and recommendations"
        ))
        
        # Limit to requested number
        limited_refined = fallback_refined[:max_refinements]
        
        return QueryRefinement(
            original_query=query,
            intent=intent,
            refined=limited_refined,
            reasoning=f"Generated {len(limited_refined)} fallback refinements based on intent '{intent}' and pattern analysis (LLM unavailable)",
            was_cached=False,
            cache_similarity=0.0,
            cost_savings={
                "llm_calls_saved": 1,
                "cache_reuse_count": 0,
                "processing_time_ms": 0,
                "cache_hit": False,
                "used_fallback": True
            }
        )
    
    def _extract_main_topic(self, query: str) -> str:
        """Extract main topic from query using improved heuristics."""
        words = query.lower().split()
        stop_words = {
            'what', 'how', 'why', 'when', 'where', 'is', 'are', 'can', 'do', 'does', 
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'me', 'i', 'you', 'my', 'give', 'show', 'explain'
        }
        
        content_words = []
        for word in words:
            clean_word = word.strip('.,!?:;()[]{}')
            if clean_word not in stop_words and len(clean_word) > 2:
                content_words.append(clean_word)
        
        if content_words:
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
        
        logger.info("Cache cleanup: %s", stats)
        return stats


# Global instance
query_refinement_agent = QueryRefinementAgent()
