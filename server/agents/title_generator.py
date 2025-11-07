"""
Title Generation Agent for creating concise chat session titles.
Generates 5-7 word titles from user queries, similar to ChatGPT's approach.
"""

import re
from typing import Optional, Dict, Any
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from server.providers import get_llm


class TitleGeneratorAgent:
    """Agent for generating concise titles from user queries."""
    
    def __init__(self):
        self.title_prompt = self._setup_title_prompt()
        self.stats = {
            "titles_generated": 0,
            "llm_generations": 0,
            "fallback_generations": 0,
            "failed_generations": 0
        }
    
    def _setup_title_prompt(self) -> ChatPromptTemplate:
        """Initialize title generation prompt."""
        return ChatPromptTemplate.from_template("""
You are a title generator that creates concise, descriptive titles for chat conversations.

Your task is to generate a title that is:
- Exactly 4-6 words (no more, no less)
- Descriptive of the main topic or question being discussed
- Clear and professional language
- Skip common words like: how, what, why, when, where, can, could, would, should, do, does, did, is, are, was, were, a, an, the, i, me, my, help, with, about
- Focus on the key subject matter and action
- Uses title case (Important Words Capitalized)

User Query: {query}
{response_context}

Generate ONLY the title with exactly 4-6 words, no additional text or explanation.

Examples:
Query: “Explain how generative AI models learn.”
Title: Understanding Generative AI Model Learning

Query: “Explain how reinforcement learning works.”
Title: Reinforcement Learning Core Concepts

Query: “How do large language models use context?”
Title: Context Utilization in Large Language Models

Query: “Show me steps to deploy FastAPI app on Azure.”
Title: FastAPI Deployment Guide on Azure

Query: “Explain RAG architecture in AI applications.”
Title: Retrieval-Augmented Generation Architecture Explained

Title:""")
    
    def _fallback_title_generation(self, query: str) -> str:
        """Generate title using simple text processing when LLM is unavailable."""
        # Clean the query
        cleaned = re.sub(r'[^\w\s]', '', query.strip())
        words = cleaned.split()
        
        # Remove common question words and articles (expanded list)
        stop_words = {'how', 'what', 'why', 'when', 'where', 'can', 'could', 'would', 'should', 
                     'do', 'does', 'did', 'is', 'are', 'was', 'were', 'a', 'an', 'the', 'i', 'me', 'my',
                     'you', 'your', 'help', 'with', 'about', 'for', 'to', 'from', 'in', 'on', 'at', 'by'}
        
        # Filter words and keep important ones
        important_words = [word for word in words if word.lower() not in stop_words and len(word) > 2]
        
        # If we don't have enough important words, take some from original
        if len(important_words) < 3:
            # Take words that aren't the most common stop words
            basic_stops = {'how', 'what', 'why', 'the', 'a', 'an', 'i', 'me'}
            important_words = [word for word in words if word.lower() not in basic_stops and len(word) > 1]
        
        # Ensure we have exactly 4-6 words
        if len(important_words) >= 6:
            title_words = important_words[:6]
        elif len(important_words) >= 4:
            title_words = important_words
        elif len(important_words) >= 2:
            # Pad with some original words to reach 4
            remaining_words = [w for w in words if w not in important_words and len(w) > 1][:2]
            title_words = important_words + remaining_words
        else:
            # Take first 4-5 words from original, skip very common ones
            title_words = [w for w in words if w.lower() not in {'the', 'a', 'an'}][:5]
        
        # Ensure we have at least 4 words
        while len(title_words) < 4 and len(words) > len(title_words):
            for word in words:
                if word not in title_words and len(word) > 1:
                    title_words.append(word)
                    break
            else:
                break
        
        # Create title case
        title = ' '.join(word.capitalize() for word in title_words[:6])
        
        # Final validation - if still not 4-6 words, create a simple fallback
        if len(title.split()) < 4:
            title = f"Chat About {' '.join(words[:3]).title()}"
        
        return title or "New Chat Session"
    
    def _validate_title(self, title: str) -> bool:
        """Validate that the generated title meets requirements."""
        if not title or len(title.strip()) == 0:
            return False
        
        words = title.strip().split()
        
        # Strict word count validation (exactly 4-6 words)
        if len(words) < 4 or len(words) > 6:
            return False
        
        # Check length (reasonable character limit)
        if len(title) > 60:
            return False
        
        return True
    
    async def generate_title(self, query: str, assistant_response: str = None, enable_tracing: bool = False) -> str:
        """
        Generate a concise title for a chat session.
        
        Args:
            query: The user's first query in the session
            assistant_response: The AI's response to help with context
            enable_tracing: Whether to enable LLM tracing
            
        Returns:
            A 4-6 word title for the chat session
        """
        try:
            # First, try simple rules for very straightforward cases
            query_lower = query.lower().strip()
            
            # Handle very short queries with simple fallback
            if len(query.split()) <= 2:
                title = self._fallback_title_generation(query)
                if self._validate_title(title):
                    self.stats["fallback_generations"] += 1
                    self.stats["titles_generated"] += 1
                    return title
            
            # Try LLM generation with context
            llm = get_llm()
            if llm:
                try:
                    # Create context from assistant response if available
                    response_context = ""
                    if assistant_response:
                        # Use first 100 words of response for context
                        response_words = assistant_response.split()[:100]
                        response_context = f"AI Response Context: {' '.join(response_words)}"
                    
                    chain = self.title_prompt | llm | StrOutputParser()
                    
                    title = await chain.ainvoke({
                        "query": query[:300],  # Allow longer query context
                        "response_context": response_context
                    })
                    
                    title = title.strip()
                    
                    # Clean up title if it has extra formatting
                    if title.startswith("Title:"):
                        title = title[6:].strip()
                    
                    # Validate LLM-generated title
                    if self._validate_title(title):
                        self.stats["llm_generations"] += 1
                        self.stats["titles_generated"] += 1
                        return title
                    
                    if enable_tracing:
                        print(f"[TITLE_GENERATOR] LLM title failed validation: '{title}' (words: {len(title.split())})")
                    
                except Exception as e:
                    if enable_tracing:
                        print(f"[TITLE_GENERATOR] LLM generation failed: {e}")
            
            # Fallback to text processing
            title = self._fallback_title_generation(query)
            self.stats["fallback_generations"] += 1
            self.stats["titles_generated"] += 1
            return title
            
        except Exception as e:
            if enable_tracing:
                print(f"[TITLE_GENERATOR] Title generation failed: {e}")
            
            self.stats["failed_generations"] += 1
            
            # Ultimate fallback
            fallback = self._fallback_title_generation(query)
            return fallback
    
    def get_stats(self) -> Dict[str, Any]:
        """Get title generation statistics."""
        total = self.stats["titles_generated"]
        return {
            **self.stats,
            "success_rate": (total / (total + self.stats["failed_generations"])) * 100 if total > 0 else 0,
            "llm_usage_rate": (self.stats["llm_generations"] / total) * 100 if total > 0 else 0
        }
    
    def reset_stats(self) -> None:
        """Reset statistics."""
        self.stats = {
            "titles_generated": 0,
            "llm_generations": 0,
            "fallback_generations": 0,
            "failed_generations": 0
        }


# Global instance
title_generator = TitleGeneratorAgent()