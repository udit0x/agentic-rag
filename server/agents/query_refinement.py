"""Query Refinement Agent for generating related questions using the 5-question technique."""

from typing import List, Dict, Any
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field

from server.providers import get_llm


class QueryRefinement(BaseModel):
    """Query refinement output structure."""
    original_query: str = Field(description="The original user query")
    refined_queries: List[str] = Field(description="5 related questions for deeper exploration")
    query_category: str = Field(description="Category of the query (temporal, factual, counterfactual)")
    refinement_reasoning: str = Field(description="Why these specific questions were chosen")


class QueryRefinementAgent:
    """Agent for generating related questions to improve query understanding."""
    
    def __init__(self):
        self.name = "query_refinement"
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

    
    async def generate_related_questions(self, query: str) -> QueryRefinement:
        """
        Generate 5 related questions for the given query.
        
        Args:
            query: The original user query
            
        Returns:
            QueryRefinement with related questions and metadata
        """
        try:
            llm = get_llm()
            if not llm:
                return self._fallback_refinement(query)
            
            # First try with the structured parser
            parser = JsonOutputParser(pydantic_object=QueryRefinement)
            chain = self.refinement_prompt | llm | parser
            
            result = await chain.ainvoke({"query": query})
            return QueryRefinement(**result)
            
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
                    refinement_reasoning=reasoning
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
                    return QueryRefinement(**parsed_data)
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
                        refinement_reasoning=reasoning
                    )
            
            # Only use fallback for non-API errors (like parsing issues)
            return self._fallback_refinement(query)
    
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
            refinement_reasoning=f"Generated contextually appropriate questions for {topic} based on query pattern analysis (LLM parsing error fallback)"
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


# Global instance
query_refinement_agent = QueryRefinementAgent()