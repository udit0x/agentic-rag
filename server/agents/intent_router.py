"""Intent Router Agent for context-aware routing decisions."""

import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field, field_validator
import re
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from server.providers import get_llm
from server.storage import storage

logger = logging.getLogger(__name__)


class IntentClassification(BaseModel):
    """Intent classification result."""
    route_type: str = Field(description="CHAT, RAG, HYBRID, META, or SUMMARY")
    confidence: float = Field(description="Confidence score 0-1")
    reasoning: str = Field(description="Brief explanation")
    conversation_references: List[str] = Field(description="References to conversation context")
    needs_retrieval: bool = Field(description="Whether new document retrieval is needed")
    reuse_cached_docs: bool = Field(description="Whether to reuse previous retrieval results")
    reuse_refined_queries: bool = Field(description="Whether to reuse previous refined queries")
    suggest_threshold_adjustment: bool = Field(default=False, description="Whether to suggest threshold adjustment")
    threshold_suggestion_message: Optional[str] = Field(default="", description="Message suggesting threshold adjustment")
    force_rag_bypass: bool = Field(default=False, description="Force RAG routing regardless of similarity")

    @field_validator('threshold_suggestion_message')
    @classmethod
    def validate_threshold_message(cls, v):
        """Convert None to empty string"""
        return v if v is not None else ""


class IntentRouterAgent:
    """Agent that determines if query needs CHAT, RAG, or HYBRID processing."""
    
    def __init__(self):
        self.name = "intent_router"
        self._setup_prompt()
    
    def _setup_prompt(self):
        """Initialize the intent classification prompt."""
        self.intent_prompt = ChatPromptTemplate.from_template("""
You are an intent router that determines how to handle user queries in a conversational RAG system.

**CONVERSATION CONTEXT:**
Recent Messages (last 3):
{recent_messages}

Previous Retrieval Context:
{previous_retrieval_context}

**CURRENT USER QUERY:** "{current_query}"

**DOCUMENT FILTER CONTEXT:**
{document_filter_context}

**ROUTING OPTIONS:**
1. **CHAT** - Use conversation memory only
   - User refers to assistant's previous response ("you said", "that", "it", "earlier")
   - Clarification requests about previous answers
   - Follow-up questions that don't need new information
   - **REPEATED QUERIES after insufficient responses** (suggest threshold adjustment)
   - **EXCEPTION: If documents are filtered AND query is about document content → RAG or SUMMARY**

2. **RAG** - Retrieve fresh documents 
   - New factual questions unrelated to conversation
   - Requests for specific information not in conversation
   - Different topic from recent conversation
   - **THRESHOLD OVERRIDE requests** (user wants broader search)
   - **DOCUMENT FILTERED QUERIES: If user has selected specific documents and asks about them**
     * Questions requiring specific facts from documents
     * "What does the document say about X"
     * Detailed information retrieval

3. **HYBRID** - Combine conversation context + retrieval
   - References previous conversation AND asks for new information
   - "Tell me more about that X you mentioned" 
   - Expansions on conversation topics needing fresh data

4. **META** - Questions about the application itself
   - "What can you do?", "How does this work?", "What are your capabilities?"
   - Questions about features, functionality, or how to use the application
   - Help requests or user guides

5. **SUMMARY** - Document understanding and summarization
   - **WHEN DOCUMENTS ARE SELECTED**: User wants to understand what's in the document(s)
   - "Summarize this document", "What is this document about?"
   - "Give me an overview of...", "Tell me about this file"
   - "What's in this document?", "Explain this document to me"
   - "What are the main points?", "Key takeaways from this document"
   - **CRITICAL**: Route to SUMMARY when user wants holistic document understanding
   - **DIFFERENT FROM RAG**: SUMMARY analyzes the ENTIRE document, not specific facts

**SPECIAL DETECTION RULES:**

**THRESHOLD ADJUSTMENT DETECTION:**
- If the current query is very similar to a recent query (>60% similarity)
- AND the previous assistant response contained indicators like:
  * "no information", "not available", "cannot find", "no details", "no mention"
  * "information gaps", "not publicly available", "contact Microsoft directly"
  * "consult official documentation", "does not mention", "does not include"
- AND there's NO evidence of recent threshold suggestion messages in conversation
- THEN set suggest_threshold_adjustment=true and route to CHAT with this EXACT threshold suggestion message:

"🔍 **Need more detailed information?**

I notice you're asking a similar question again. If my previous answer didn't provide enough detail, you might want to try:
• **Lowering the document threshold** (in settings) to retrieve more documents
• **Asking more specific questions** about particular aspects
• **Using different keywords** that might match the documents better
"Once you lower the threshold, I can search again for more comprehensive results."

**THRESHOLD OVERRIDE DETECTION:**
- If query contains keywords like:
  * "lower threshold", "search deeper", "find more", "comprehensive search"
  * "broaden search", "more documents", "detailed search"
- OR if the user asks the same question after the assistant has already suggested threshold adjustment
- OR if recent conversation shows threshold suggestion messages
- THEN set force_rag_bypass=true and route to RAG

**OPTIMIZATION RULES:**
- If user query is very similar to a recent query, consider reusing previous retrieval
- If conversation is about same document/topic, reuse cached results when possible
- If previous refined questions already cover the current query, reuse them

**CONVERSATION REFERENCE INDICATORS:**
- Pronouns: "it", "that", "this", "they", "those"
- References: "you said", "you mentioned", "earlier", "before", "above"
- Clarifications: "what do you mean", "can you explain", "more details"
- Continuations: "also", "additionally", "furthermore", "and"

Analyze the query and return JSON:
{{
  "route_type": "CHAT|RAG|HYBRID|META|SUMMARY",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of routing decision",
  "conversation_references": ["list", "of", "found", "references"],
  "needs_retrieval": true/false,
  "reuse_cached_docs": true/false,
  "reuse_refined_queries": true/false,
  "suggest_threshold_adjustment": true/false,
  "threshold_suggestion_message": "message suggesting threshold adjustment (if applicable)",
  "force_rag_bypass": true/false
}}
""")
    
    def _detect_meta_question(self, query: str) -> bool:
        """Detect if query is asking about the application itself."""
        query_lower = query.lower()
        
        # Meta question patterns
        meta_patterns = [
            r'\bwhat (can|do) you do\b',
            r'\bwhat are your capabilities\b',
            r'\bhow (does|do) (this|you) work\b',
            r'\bwhat is this (app|application|system)\b',
            r'\bhow can you help\b',
            r'\bwhat features\b',
            r'\bwhat functions\b',
            r'\bhow to use\b',
            r'\buser guide\b',
            r'\bhelp me\b',
            r'\bwhat kind of questions\b',
            r'\bwhat (type|sort) of (things|questions)\b',
            r'\btell me about (yourself|this system|this app)\b',
            r'\bwhat\'s your purpose\b',
            r'\bwhat were you (built|designed) for\b'
        ]
        
        for pattern in meta_patterns:
            if re.search(pattern, query_lower):
                return True
                
        return False
    
    def _detect_summary_request(self, query: str, document_ids: Optional[List[str]] = None) -> bool:
        """
        Detect if query is requesting document summary/overview/understanding.
        Only triggers when documents are selected (document_ids provided).
        
        IMPORTANT: This should ONLY trigger for holistic document understanding requests,
        NOT for specific topic searches within documents.
        
        Examples that SHOULD trigger:
        - "Summarize this document"
        - "What is this document about?" (without specific topic)
        - "Give me an overview of this file"
        - "Main points from this document"
        
        Examples that should NOT trigger:
        - "In this document I want to understand about Azure pricing" (specific topic → RAG)
        - "What does this document say about X" (specific query → RAG)
        - "Find information about Y in this document" (specific search → RAG)
        """
        # Only consider as summary request if documents are selected
        if not document_ids or len(document_ids) == 0:
            return False
        
        query_lower = query.lower()
        
        # EXCLUSION CHECK: If query mentions a specific topic/keyword to search for, it's NOT a summary request
        # These patterns indicate the user wants to search FOR something, not get an overview
        specific_search_indicators = [
            r'\b(about|regarding|on|for|find|search|look for|information about|details about|tell me about)\s+\w+',
            r'\bwant to (know|understand|learn|find)\s+(about|regarding)',
            r'\b(what|how|why|when|where|who)\s+(does|do|is|are|can|should|would).+(say|mention|explain|describe|tell)',
            r'\bin (this|the|these) (document|file).+(i want|want to|need to|looking for|find)',
        ]
        
        for pattern in specific_search_indicators:
            if re.search(pattern, query_lower):
                # Check if there's actual content after the indicator (not just asking about the document itself)
                # Extract what comes after "about", "regarding", etc.
                match = re.search(pattern, query_lower)
                if match:
                    # Get text after the match to see if it's a specific topic
                    after_match = query_lower[match.end():].strip()
                    # If there's substantial text after (>3 characters), it's likely a specific topic search
                    if len(after_match) > 3:
                        logger.debug("Specific topic search detected: '%s' - NOT routing to summary", query)
                        return False
        
        # VERY SPECIFIC summary request patterns - must be clear intent for document overview
        summary_patterns = [
            # Explicit summary/overview requests (no specific topic mentioned)
            r'^\s*(summarize|summary|overview)\s*(this|the|these)?\s*(document|file|doc|pdf)s?\s*$',
            r'^\s*give me (a|an)?\s*(summary|overview)\s*$',
            r'^\s*provide (a|an)?\s*(summary|overview)\s*$',
            
            # "What is this document about" - ONLY if no specific topic follows
            r'^\s*what (is|are) (this|the|these) (document|file|doc|pdf)s?\s*(about|for)?\s*\??\s*$',
            r'^\s*what (does|do) (this|the|these) (document|file|doc|pdf)s?\s*contain\s*\??\s*$',
            
            # Main points / key takeaways (without specific topic)
            r'^\s*(main|key) (points|takeaways|themes|topics|ideas|findings)\s*$',
            r'^\s*key (information|insights|highlights)\s*$',
            
            # High-level overview (without specific topic)
            r'^\s*(give|provide)\s*(me)?\s*(a|an)?\s*high.?level (overview|summary)\s*$',
            
            # Short queries that are clearly asking for document overview (no specific topic)
            r'^\s*what is (this|it)\s*about\s*\??\s*$',
            r'^\s*tell me about (this|it)\s*\??\s*$',
            r'^\s*explain (this|it)\s*\??\s*$',
            r'^\s*describe (this|it)\s*\??\s*$',
        ]
        
        for pattern in summary_patterns:
            if re.search(pattern, query_lower):
                logger.debug("Summary request detected: '%s' matches pattern '%s'", query, pattern)
                return True
        
        return False
    
    def _extract_conversation_references(self, query: str) -> List[str]:
        """Extract conversation reference indicators from query."""
        query_lower = query.lower()
        references = []
        
        # Pronoun patterns
        pronouns = ['it', 'that', 'this', 'they', 'those', 'them', 'these']
        for pronoun in pronouns:
            if re.search(rf'\b{pronoun}\b', query_lower):
                references.append(pronoun)
        
        # Reference patterns
        ref_patterns = [
            r'\byou (said|mentioned|told|explained)\b',
            r'\bearlier\b', r'\bbefore\b', r'\babove\b',
            r'\bwhat do you mean\b', r'\bcan you explain\b',
            r'\bmore details\b', r'\btell me more\b',
            r'\balso\b', r'\badditionally\b', r'\bfurthermore\b'
        ]
        
        for pattern in ref_patterns:
            if re.search(pattern, query_lower):
                match = re.search(pattern, query_lower)
                if match:
                    references.append(match.group())
        
        return list(set(references))
    
    def _analyze_repeated_query_pattern(
        self, 
        current_query: str, 
        recent_queries: List[str], 
        recent_messages: List[dict],
        query_similarity: float
    ) -> Tuple[bool, str]:
        """
        Analyze if this is a repeated query that might benefit from threshold adjustment.
        
        Returns: (should_suggest_threshold, suggestion_message)
        """
        logger.debug("Analyzing repeated query pattern:")
        logger.debug("- Current query: %s", current_query)
        logger.debug("- Query similarity: %f", query_similarity)
        logger.debug("- Recent queries: %s", recent_queries)
        
        if query_similarity < 0.6:  # Not similar enough to be considered a repeat
            logger.debug("- Not similar enough (< 0.6), skipping")
            return False, ""
        
        logger.debug("- High similarity detected, checking recent messages...")
        
        # First check if we've already suggested threshold adjustment
        for msg in recent_messages:
            if msg.get('role') == 'assistant':
                content = msg.get('content', '')
                if '🔍 **Need more detailed information?**' in content or 'lower threshold' in content.lower():
                    logger.debug("- Found previous threshold suggestion, should bypass to RAG")
                    return False, ""  # Don't suggest again, let it go to RAG with override
        
        # Check if the previous assistant response indicated missing information
        if len(recent_messages) >= 2:
            last_assistant_message = None
            for msg in reversed(recent_messages):
                if msg.get('role') == 'assistant':
                    last_assistant_message = msg.get('content', '').lower()
                    logger.debug("- Last assistant message (first 200 chars): %s", last_assistant_message[:200])
                    break
            
            # Look for indicators that the previous response was insufficient
            insufficient_indicators = [
                'no information',
                'not available',
                'cannot find',
                'no details',
                'no mention',
                'no specific',
                'no context',
                'information gaps',
                'not publicly available',
                'not disclosed',
                'no pricing',
                'no cost',
                'contact microsoft directly',
                'consult official documentation',
                'does not mention',
                'does not include'
            ]
            
            if last_assistant_message:
                for indicator in insufficient_indicators:
                    if indicator in last_assistant_message:
                        logger.debug("- Found insufficient indicator: '%s'", indicator)
                        # This looks like a repeated query after an insufficient answer
                        suggestion = (
                            "🔍 **Need more detailed information?**\n\n"
                            "I notice you're asking a similar question again. If my previous answer didn't provide enough detail, "
                            "you might want to try:\n"
                            "• **Lowering the document threshold** (in settings) to retrieve more documents\n"
                            "• **Asking more specific questions** about particular aspects\n"
                            "• **Using different keywords** that might match the documents better\n\n"
                            "*Would you like me to search with a lower threshold for more comprehensive results?*"
                        )
                        return True, suggestion
        
        logger.debug("- No threshold suggestion needed")
        return False, ""

    def _check_for_threshold_override(self, query: str) -> bool:
        """
        Check if user is requesting a threshold adjustment or override.
        """
        threshold_keywords = [
            'lower threshold',
            'reduce threshold', 
            'more documents',
            'search deeper',
            'find more',
            'comprehensive search',
            'detailed search',
            'broaden search',
            'expand search'
        ]
        
        query_lower = query.lower()
        return any(keyword in query_lower for keyword in threshold_keywords)

    def _check_for_previous_threshold_suggestion(self, recent_messages: List[dict], query_similarity: float) -> bool:
        """
        Check if we previously suggested threshold adjustment and this is a similar query.
        """
        if query_similarity < 0.6:  # Not similar enough
            return False
            
        # Look for threshold suggestion messages in recent conversation
        for msg in recent_messages:
            if msg.get('role') == 'assistant':
                content = msg.get('content', '')
                if ('🔍 **Need more detailed information?**' in content or 
                    'lower threshold' in content.lower() or
                    'Would you like me to search with a lower threshold' in content):
                    logger.debug("- Found previous threshold suggestion, forcing RAG bypass")
                    return True
        return False
    
    def _is_query_about_document_content(self, query: str) -> bool:
        """
        Detect if query is asking about general document content (when documents are filtered).
        
        IMPORTANT: This should ONLY trigger for GENERAL document questions,
        NOT for specific topic searches.
        
        Examples that SHOULD trigger:
        - "What does this document do?"
        - "What is in this document?" (without specific topic)
        - "Tell me about this document" (without specific topic)
        
        Examples that should NOT trigger:
        - "What does this document say about Azure pricing?" (specific topic → goes through normal RAG)
        - "In this document find information about X" (specific search)
        """
        query_lower = query.lower()
        
        # EXCLUSION CHECK: If query asks about a specific topic, it's NOT a general document query
        # These patterns indicate specific information search, not general document overview
        specific_topic_indicators = [
            r'\b(about|regarding|on|for)\s+\w{3,}',  # "about [topic]", "regarding [topic]"
            r'\b(find|search|look for|information on|details on)\s+\w+',
            r'\bwant to (know|understand|learn|find)\s+about',
            r'\bin (this|the) (document|file).+(i want|want to|need|looking for)',
        ]
        
        for pattern in specific_topic_indicators:
            if re.search(pattern, query_lower):
                # Extract what comes after to verify it's a topic, not just trailing words
                match = re.search(pattern, query_lower)
                if match:
                    after_match = query_lower[match.end():].strip()
                    # If there's content after (indicating a specific topic), don't trigger
                    if len(after_match) > 3:
                        logger.debug("Specific topic in query detected: '%s' - NOT general document query", query)
                        return False
        
        # Very specific patterns for GENERAL document content questions (no specific topic)
        document_content_patterns = [
            # General "what does this document" questions (MUST be at start and not followed by "about [topic]")
            r'^\s*what (does|is|do) (this|the|these) (document|file|doc|pdf)s?\s*(do|contain)?\s*\??\s*$',
            
            # General "tell me about this document" (NOT "tell me about [topic] in this document")
            r'^\s*tell me about (this|the|these) (document|file|doc)s?\s*\??\s*$',
            
            # General "what is in this document" (no specific topic)
            r'^\s*what (is|are) in (this|the|these) (document|file|doc)s?\s*\??\s*$',
            
            # Explain/describe the document itself (not a topic within it)
            r'^\s*(explain|describe) (this|the|these) (document|file|doc)s?\s*\??\s*$',
        ]
        
        for pattern in document_content_patterns:
            if re.search(pattern, query_lower):
                logger.debug("General document content query detected: '%s' matches pattern '%s'", query, pattern)
                return True
        
        # Short pronoun-based queries ONLY if they're very short (likely referring to selected docs)
        # "What does it do", "What is it about" - but ONLY if query is < 6 words
        if len(query.split()) <= 6:
            pronoun_patterns = [
                r'^\s*what (does|is|do) (it|they)\s*(do|about|for)?\s*\??\s*$',
                r'^\s*tell me about (it|them)\s*\??\s*$',
                r'^\s*(explain|describe) (it|them)\s*\??\s*$',
            ]
            
            for pattern in pronoun_patterns:
                if re.search(pattern, query_lower):
                    logger.debug("General document pronoun query detected: '%s' matches pattern '%s'", query, pattern)
                    return True
        
        return False

    def _analyze_query_similarity(self, current_query: str, recent_queries: List[str]) -> float:
        """Calculate similarity between current and recent queries (simple approach)."""
        if not recent_queries:
            return 0.0
        
        current_lower = current_query.lower()
        max_similarity = 0.0
        
        for recent_query in recent_queries:
            recent_lower = recent_query.lower()
            
            # Simple word overlap similarity
            current_words = set(current_lower.split())
            recent_words = set(recent_lower.split())
            
            if len(current_words) == 0 or len(recent_words) == 0:
                continue
                
            intersection = current_words.intersection(recent_words)
            union = current_words.union(recent_words)
            
            similarity = len(intersection) / len(union) if union else 0.0
            max_similarity = max(max_similarity, similarity)
        
        return max_similarity
    
    def _fallback_classification(
        self, 
        query: str, 
        recent_messages: List[Dict[str, Any]], 
        previous_retrieval: Optional[Dict[str, Any]],
        document_ids: Optional[List[str]] = None
    ) -> IntentClassification:
        """Fallback classification when LLM is unavailable."""
        
        # 🚀 NEW: Check for summary requests first (when documents are selected)
        if document_ids and len(document_ids) > 0:
            if self._detect_summary_request(query, document_ids):
                logger.info("Fallback: Summary request detected for %d document(s)", len(document_ids))
                return IntentClassification(
                    route_type="SUMMARY",
                    confidence=0.9,
                    reasoning=f"User requested summary/overview of {len(document_ids)} document(s) (fallback)",
                    conversation_references=[],
                    needs_retrieval=False,
                    reuse_cached_docs=False,
                    reuse_refined_queries=False,
                    suggest_threshold_adjustment=False,
                    threshold_suggestion_message="",
                    force_rag_bypass=False
                )
        
        # 🚀 NEW: Check if documents are filtered and query is about document content
        # This should be checked first, even in fallback
        if document_ids and len(document_ids) > 0:
            if self._is_query_about_document_content(query):
                logger.info("Fallback: Document filter detected (%d docs) + document content query → RAG routing", len(document_ids))
                return IntentClassification(
                    route_type="RAG",
                    confidence=0.95,
                    reasoning=f"User has selected {len(document_ids)} document(s) and is asking about document content - routing to RAG for retrieval",
                    conversation_references=[],
                    needs_retrieval=True,
                    reuse_cached_docs=False,
                    reuse_refined_queries=False,
                    suggest_threshold_adjustment=False,
                    threshold_suggestion_message="",
                    force_rag_bypass=False
                )
        
        # Check for threshold override keywords first
        force_rag_bypass = self._check_for_threshold_override(query)
        
        # Also check if we previously suggested threshold adjustment
        if not force_rag_bypass:
            # Get recent user queries for similarity analysis
            recent_queries = [
                msg.get('content', '') for msg in recent_messages 
                if msg.get('role') == 'user'
            ]
            query_similarity = self._analyze_query_similarity(query, recent_queries[:3])
            force_rag_bypass = self._check_for_previous_threshold_suggestion(recent_messages, query_similarity)
        
        # Check for meta questions first
        if self._detect_meta_question(query):
            return IntentClassification(
                route_type="META",
                confidence=0.9,
                reasoning="Question about application capabilities detected",
                conversation_references=[],
                needs_retrieval=False,
                reuse_cached_docs=False,
                reuse_refined_queries=False,
                suggest_threshold_adjustment=False,
                threshold_suggestion_message="",
                force_rag_bypass=False
            )
        
        # Extract conversation references
        conversation_refs = self._extract_conversation_references(query)
        
        # Get recent user queries for similarity analysis
        recent_queries = [
            msg.get('content', '') for msg in recent_messages 
            if msg.get('role') == 'user'
        ]
        
        query_similarity = self._analyze_query_similarity(query, recent_queries[:3])
        
        # Check for repeated query pattern that might need threshold adjustment
        suggest_threshold, threshold_message = self._analyze_repeated_query_pattern(
            query, recent_queries, recent_messages, query_similarity
        )
        
        # If user requested threshold override, force RAG routing
        if force_rag_bypass:
            return IntentClassification(
                route_type="RAG",
                confidence=0.9,
                reasoning="User requested threshold override or broader search",
                conversation_references=[],
                needs_retrieval=True,
                reuse_cached_docs=False,
                reuse_refined_queries=False,
                suggest_threshold_adjustment=False,
                threshold_suggestion_message="",
                force_rag_bypass=True
            )
        
        # Decision logic
        if conversation_refs and len(conversation_refs) >= 2:
            # Strong conversation references - likely CHAT
            return IntentClassification(
                route_type="CHAT",
                confidence=0.8,
                reasoning=f"Multiple conversation references detected: {conversation_refs}",
                conversation_references=conversation_refs,
                needs_retrieval=False,
                reuse_cached_docs=False,
                reuse_refined_queries=False,
                suggest_threshold_adjustment=suggest_threshold,
                threshold_suggestion_message=threshold_message,
                force_rag_bypass=False
            )
        elif conversation_refs and query_similarity > 0.3:
            # Some references + topic similarity - likely HYBRID
            return IntentClassification(
                route_type="HYBRID", 
                confidence=0.7,
                reasoning=f"Conversation references + topic similarity: {query_similarity:.2f}",
                conversation_references=conversation_refs,
                needs_retrieval=True,
                reuse_cached_docs=query_similarity > 0.6,
                reuse_refined_queries=query_similarity > 0.5,
                suggest_threshold_adjustment=suggest_threshold,
                threshold_suggestion_message=threshold_message,
                force_rag_bypass=False
            )
        elif query_similarity > 0.7 and not suggest_threshold:
            # Very similar to recent query - but check if it needs threshold adjustment
            return IntentClassification(
                route_type="RAG",
                confidence=0.6,
                reasoning=f"High query similarity: {query_similarity:.2f}, reusing previous retrieval",
                conversation_references=[],
                needs_retrieval=False,
                reuse_cached_docs=True,
                reuse_refined_queries=True,
                suggest_threshold_adjustment=False,
                threshold_suggestion_message="",
                force_rag_bypass=False
            )
        elif suggest_threshold:
            # Repeated query that might benefit from threshold adjustment
            return IntentClassification(
                route_type="CHAT",  # Route to chat with threshold suggestion
                confidence=0.8,
                reasoning=f"Repeated query detected with insufficient previous results: {query_similarity:.2f}",
                conversation_references=[],
                needs_retrieval=False,
                reuse_cached_docs=False,
                reuse_refined_queries=False,
                suggest_threshold_adjustment=True,
                threshold_suggestion_message=threshold_message,
                force_rag_bypass=False
            )
        else:
            # New topic - fresh RAG
            return IntentClassification(
                route_type="RAG",
                confidence=0.9,
                reasoning="New topic, needs fresh document retrieval",
                conversation_references=[],
                needs_retrieval=True,
                reuse_cached_docs=False,
                reuse_refined_queries=False,
                suggest_threshold_adjustment=False,
                threshold_suggestion_message="",
                force_rag_bypass=False
            )
    
    async def classify_intent(
        self, 
        query: str, 
        session_id: Optional[str] = None,
        enable_tracing: bool = True,
        document_ids: Optional[List[str]] = None
    ) -> IntentClassification:
        """
        Classify user intent for routing decision.
        
        Args:
            query: Current user query
            session_id: Chat session ID for conversation context
            enable_tracing: Whether to track execution time
            document_ids: Optional list of document IDs that user has selected to filter search.
                         If provided and query is about document content, routes to RAG.
            
        Returns:
            IntentClassification with routing decision
        """
        start_time = datetime.now() if enable_tracing else None
        
        try:
            # 🚀 NEW: Check for summary requests first (when documents are selected)
            # Summary takes precedence over other routing when user wants document understanding
            if document_ids and len(document_ids) > 0:
                if self._detect_summary_request(query, document_ids):
                    logger.info("Summary request detected for %d document(s)", len(document_ids))
                    return IntentClassification(
                        route_type="SUMMARY",
                        confidence=0.95,
                        reasoning=f"User requested summary/overview of {len(document_ids)} document(s)",
                        conversation_references=[],
                        needs_retrieval=False,  # Full documents will be retrieved, not chunks
                        reuse_cached_docs=False,
                        reuse_refined_queries=False,
                        suggest_threshold_adjustment=False,
                        threshold_suggestion_message="",
                        force_rag_bypass=False
                    )
            
            # 🚀 EXISTING: Check if documents are filtered and query is about document content
            # If user has selected specific documents and asks about them, route to RAG
            if document_ids and len(document_ids) > 0:
                if self._is_query_about_document_content(query):
                    logger.info("Document filter detected (%d docs) + document content query → RAG routing", len(document_ids))
                    return IntentClassification(
                        route_type="RAG",
                        confidence=0.95,
                        reasoning=f"User has selected {len(document_ids)} document(s) and is asking about document content - routing to RAG for retrieval",
                        conversation_references=[],
                        needs_retrieval=True,
                        reuse_cached_docs=False,
                        reuse_refined_queries=False,
                        suggest_threshold_adjustment=False,
                        threshold_suggestion_message="",
                        force_rag_bypass=False
                    )
            
            # Get conversation context
            recent_messages = []
            previous_retrieval = None
            
            if session_id:
                try:
                    # Get last 6 messages (3 pairs of user-assistant)
                    messages = await storage.getSessionMessages(session_id, page=1, limit=6)
                    recent_messages = messages[:6]  # Most recent first
                    
                    # Look for previous retrieval context in assistant messages
                    for msg in recent_messages:
                        if (msg.get('role') == 'assistant' and 
                            msg.get('sources') and 
                            len(msg.get('sources', [])) > 0):
                            previous_retrieval = {
                                'sources': msg.get('sources'),
                                'query': next((m.get('content') for m in recent_messages 
                                             if m.get('role') == 'user'), None),
                                'timestamp': msg.get('createdAt')
                            }
                            break
                            
                except Exception as e:
                    logger.error("Error getting conversation context: %s", e, exc_info=True)
                    recent_messages = []
                    previous_retrieval = None
            
            # Try LLM classification first
            llm = get_llm()
            if llm:
                try:
                    # Format conversation context
                    formatted_messages = []
                    for msg in recent_messages:
                        role = msg.get('role', 'unknown')
                        content = msg.get('content', '')[:200]  # Truncate for prompt
                        formatted_messages.append(f"{role}: {content}")
                    
                    messages_context = "\n".join(formatted_messages) if formatted_messages else "No recent conversation"
                    
                    # Check for threshold override keywords first
                    force_rag_bypass = self._check_for_threshold_override(query)
                    
                    # Also check if we previously suggested threshold adjustment
                    if not force_rag_bypass:
                        # Get recent user queries for similarity analysis
                        recent_queries = [
                            msg.get('content', '') for msg in recent_messages 
                            if msg.get('role') == 'user'
                        ]
                        query_similarity = self._analyze_query_similarity(query, recent_queries[:3])
                        force_rag_bypass = self._check_for_previous_threshold_suggestion(recent_messages, query_similarity)
                    
                    # If we detected a threshold override, return RAG routing immediately
                    if force_rag_bypass:
                        logger.info("Threshold override detected, forcing RAG routing")
                        return IntentClassification(
                            route_type="RAG",
                            confidence=0.9,
                            reasoning="Previous threshold suggestion detected - routing to RAG with lower threshold",
                            conversation_references=[],
                            needs_retrieval=True,
                            reuse_cached_docs=False,
                            reuse_refined_queries=False,
                            suggest_threshold_adjustment=False,
                            threshold_suggestion_message="",
                            force_rag_bypass=True
                        )
                    
                    retrieval_context = "No previous retrieval"
                    if previous_retrieval:
                        source_files = [s.get('filename', 'unknown') for s in previous_retrieval.get('sources', [])]
                        retrieval_context = f"Previous query about: {source_files}"
                    
                    # Format document filter context for prompt
                    document_filter_context = "No document filter - searching all documents"
                    if document_ids and len(document_ids) > 0:
                        document_filter_context = f"User has selected {len(document_ids)} specific document(s) to search in. If the query asks about document content (e.g., 'What does this document do', 'What is in this document'), route to RAG to retrieve information from these selected documents."
                    
                    logger.debug("LLM input context:")
                    logger.debug("- Query: %s", query)
                    logger.debug("- Messages context: %s", messages_context)
                    logger.debug("- Retrieval context: %s", retrieval_context)
                    logger.debug("- Document filter context: %s", document_filter_context)
                    
                    parser = JsonOutputParser(pydantic_object=IntentClassification)
                    chain = self.intent_prompt | llm | parser
                    
                    result = await chain.ainvoke({
                        "current_query": query,
                        "recent_messages": messages_context,
                        "previous_retrieval_context": retrieval_context,
                        "document_filter_context": document_filter_context
                    })
                    
                    logger.info("LLM classification result: %s", result)
                    
                    return IntentClassification(**result)
                    
                except Exception as e:
                    logger.warning("LLM classification failed: %s", e, exc_info=True)
                    # Fall back to rule-based
                    pass
            
            # Fallback to rule-based classification
            return self._fallback_classification(query, recent_messages, previous_retrieval, document_ids)
            
        except Exception as e:
            logger.error("Classification error: %s", e, exc_info=True)
            # Ultimate fallback - default to RAG
            return IntentClassification(
                route_type="RAG",
                confidence=0.5,
                reasoning=f"Error in classification, defaulting to RAG: {str(e)}",
                conversation_references=[],
                needs_retrieval=True,
                reuse_cached_docs=False,
                reuse_refined_queries=False
            )


# Global intent router agent instance
intent_router_agent = IntentRouterAgent()