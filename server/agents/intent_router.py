"""Intent Router Agent for context-aware routing decisions."""

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


class IntentClassification(BaseModel):
    """Intent classification result."""
    route_type: str = Field(description="CHAT, RAG, HYBRID, or META")
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

**ROUTING OPTIONS:**
1. **CHAT** - Use conversation memory only
   - User refers to assistant's previous response ("you said", "that", "it", "earlier")
   - Clarification requests about previous answers
   - Follow-up questions that don't need new information
   - **REPEATED QUERIES after insufficient responses** (suggest threshold adjustment)

2. **RAG** - Retrieve fresh documents 
   - New factual questions unrelated to conversation
   - Requests for specific information not in conversation
   - Different topic from recent conversation
   - **THRESHOLD OVERRIDE requests** (user wants broader search)

3. **HYBRID** - Combine conversation context + retrieval
   - References previous conversation AND asks for new information
   - "Tell me more about that X you mentioned" 
   - Expansions on conversation topics needing fresh data

4. **META** - Questions about the application itself
   - "What can you do?", "How does this work?", "What are your capabilities?"
   - Questions about features, functionality, or how to use the application
   - Help requests or user guides

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
  "route_type": "CHAT|RAG|HYBRID|META",
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
        print(f"[INTENT_ROUTER] Analyzing repeated query pattern:")
        print(f"[INTENT_ROUTER] - Current query: {current_query}")
        print(f"[INTENT_ROUTER] - Query similarity: {query_similarity}")
        print(f"[INTENT_ROUTER] - Recent queries: {recent_queries}")
        
        if query_similarity < 0.6:  # Not similar enough to be considered a repeat
            print(f"[INTENT_ROUTER] - Not similar enough (< 0.6), skipping")
            return False, ""
        
        print(f"[INTENT_ROUTER] - High similarity detected, checking recent messages...")
        
        # First check if we've already suggested threshold adjustment
        for msg in recent_messages:
            if msg.get('role') == 'assistant':
                content = msg.get('content', '')
                if '🔍 **Need more detailed information?**' in content or 'lower threshold' in content.lower():
                    print(f"[INTENT_ROUTER] - Found previous threshold suggestion, should bypass to RAG")
                    return False, ""  # Don't suggest again, let it go to RAG with override
        
        # Check if the previous assistant response indicated missing information
        if len(recent_messages) >= 2:
            last_assistant_message = None
            for msg in reversed(recent_messages):
                if msg.get('role') == 'assistant':
                    last_assistant_message = msg.get('content', '').lower()
                    print(f"[INTENT_ROUTER] - Last assistant message (first 200 chars): {last_assistant_message[:200]}")
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
                        print(f"[INTENT_ROUTER] - Found insufficient indicator: '{indicator}'")
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
        
        print(f"[INTENT_ROUTER] - No threshold suggestion needed")
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
                    print(f"[INTENT_ROUTER] - Found previous threshold suggestion, forcing RAG bypass")
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
        previous_retrieval: Optional[Dict[str, Any]]
    ) -> IntentClassification:
        """Fallback classification when LLM is unavailable."""
        
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
        enable_tracing: bool = True
    ) -> IntentClassification:
        """
        Classify user intent for routing decision.
        
        Args:
            query: Current user query
            session_id: Chat session ID for conversation context
            enable_tracing: Whether to track execution time
            
        Returns:
            IntentClassification with routing decision
        """
        start_time = datetime.now() if enable_tracing else None
        
        try:
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
                    print(f"[INTENT_ROUTER] Error getting conversation context: {e}")
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
                        print(f"[INTENT_ROUTER] Threshold override detected, forcing RAG routing")
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
                    
                    print(f"[INTENT_ROUTER] LLM input context:")
                    print(f"[INTENT_ROUTER] - Query: {query}")
                    print(f"[INTENT_ROUTER] - Messages context: {messages_context}")
                    print(f"[INTENT_ROUTER] - Retrieval context: {retrieval_context}")
                    
                    parser = JsonOutputParser(pydantic_object=IntentClassification)
                    chain = self.intent_prompt | llm | parser
                    
                    result = await chain.ainvoke({
                        "current_query": query,
                        "recent_messages": messages_context,
                        "previous_retrieval_context": retrieval_context
                    })
                    
                    print(f"[INTENT_ROUTER] LLM classification result: {result}")
                    
                    return IntentClassification(**result)
                    
                except Exception as e:
                    print(f"[INTENT_ROUTER] LLM classification failed: {e}")
                    # Fall back to rule-based
                    pass
            
            # Fallback to rule-based classification
            return self._fallback_classification(query, recent_messages, previous_retrieval)
            
        except Exception as e:
            print(f"[INTENT_ROUTER] Classification error: {e}")
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