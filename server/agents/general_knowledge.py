"""General Knowledge Agent for foundational AI responses."""
import logging
from typing import List, Dict, Any
from datetime import datetime
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from server.providers import get_llm
from server.agents.state import QueryClassification, AgentTrace

logger = logging.getLogger(__name__)

# General knowledge prompt template
GENERAL_KNOWLEDGE_PROMPT = """You are a knowledgeable AI assistant answering questions using your foundational knowledge. The user has asked a question that couldn't be answered using their uploaded documents, so you're providing information from your training data.

Question: {question}

Classification: {classification_type} (Confidence: {confidence})

Instructions:
1. **Clear Attribution**: Start your response by clearly stating this is from your general knowledge, not the user's documents
2. **Comprehensive Answer**: Provide a thorough, accurate response using your foundational knowledge
3. **Structured Response**: Use clear sections, bullet points, and examples when helpful
4. **No Hallucination**: Only provide information you're confident about from your training
5. **Context Awareness**: If the question seems related to specific documents the user might need, suggest they upload relevant materials
6. **Educational Value**: Make your response educational and helpful

**Important**: Always begin with a clear disclaimer that this information comes from your general knowledge, not the user's uploaded documents.

Format your response as:
- **Brief disclaimer** about using general knowledge
- **Main answer** with clear structure
- **Additional context** or related information if helpful
- **Suggestion** for relevant documents if applicable

Answer:"""

class GeneralKnowledgeAgent:
    """Agent responsible for providing responses using foundational AI knowledge."""
    
    def __init__(self):
        # Get LLM dynamically from provider
        self.llm = None
        self.prompt = ChatPromptTemplate.from_template(GENERAL_KNOWLEDGE_PROMPT)
        self.general_knowledge_chain = None
    
    def _get_llm(self):
        """Get the current LLM instance."""
        if self.llm is None:
            try:
                self.llm = get_llm()
                # Rebuild chain when LLM is available
                self._build_chain()
            except Exception as e:
                logger.error("Error getting LLM: %s", e, exc_info=True)
                return None
        return self.llm
    
    def _build_chain(self):
        """Build the general knowledge chain with current LLM."""
        if self.llm:
            self.general_knowledge_chain = (
                {
                    "question": lambda x: x["query"],
                    "classification_type": lambda x: x["classification"]["type"],
                    "confidence": lambda x: x["classification"]["confidence"]
                }
                | self.prompt
                | self.llm
                | StrOutputParser()
            )
    
    def _fallback_response(self, query: str) -> str:
        """Fallback response when LLM is unavailable."""
        return f"""**⚠️ Using General Knowledge**

I don't have access to any relevant documents in your uploads to answer: "{query}"

However, I can provide some general information, though it would be more helpful if you could upload documents related to your specific question.

**General Response:**
I understand you're asking about "{query}". Without specific documents or context, I can only provide general information. For the most accurate and relevant answer to your specific situation, please consider uploading documents that contain information related to your question.

**Suggestion:**
Upload relevant documents, policies, guides, or other materials that might contain the specific information you're looking for."""
    
    async def generate_response(
        self,
        query: str,
        classification: QueryClassification,
        enable_tracing: bool = True
    ) -> str:
        """
        Generate a response using general AI knowledge.
        
        Args:
            query: User's question
            classification: Query classification
            enable_tracing: Whether to track execution time
            
        Returns:
            Response based on foundational AI knowledge
        """
        start_time = datetime.now() if enable_tracing else None
        
        try:
            # Ensure LLM is available
            llm = self._get_llm()
            if not llm or not self.general_knowledge_chain:
                return self._fallback_response(query)
            
            # Generate response using LLM chain
            response = await self.general_knowledge_chain.ainvoke({
                "query": query,
                "classification": classification
            })
            
            return response
            
        except Exception as e:
            error_msg = str(e)
            logger.error("General Knowledge Agent error: %s", error_msg, exc_info=True)
            
            # Detect API errors and return specific error message instead of fallback
            if "429" in error_msg and ("quota" in error_msg.lower() or "rate limit" in error_msg.lower()):
                return "🚫 **API Quota Exceeded**\n\nThe OpenAI API quota has been exceeded. Please check your billing and usage limits, verify your API key has sufficient credits, and try again later when your quota resets."
            elif "401" in error_msg and "api" in error_msg.lower():
                return "🔑 **API Authentication Failed**\n\nThere's an issue with your API configuration. Please check that your API key is correct and has the necessary permissions."
            elif ("openai" in error_msg.lower() or "azure" in error_msg.lower()) and ("api" in error_msg.lower() or "connection" in error_msg.lower()):
                return "🌐 **API Connection Error**\n\nUnable to connect to the AI service. Please check your internet connection and API configuration."
            else:
                return self._fallback_response(query)
    
    def create_trace(
        self,
        query: str,
        classification: QueryClassification,
        response: str,
        start_time: datetime,
        error: str = None
    ) -> AgentTrace:
        """Create execution trace for this agent."""
        end_time = datetime.now()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)
        
        output_data = {
            "response_length": len(response),
            "classification_type": classification["type"],
            "used_general_knowledge": True
        } if not error else None
        
        return AgentTrace(
            agent_name="general_knowledge",
            start_time=start_time,
            end_time=end_time,
            input_data={
                "query": query,
                "classification": classification
            },
            output_data=output_data,
            error=error,
            duration_ms=duration_ms
        )

# Global general knowledge agent instance
general_knowledge_agent = GeneralKnowledgeAgent()