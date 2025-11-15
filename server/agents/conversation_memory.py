"""Conversation Memory Agent using LangChain memory components."""

import logging
from typing import Dict, Any, List, Optional, Union
from datetime import datetime, timedelta
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

logger = logging.getLogger(__name__)
try:
    from langchain_community.memory import (
        ConversationBufferWindowMemory,
        ConversationSummaryBufferMemory
    )
except ImportError:
    try:
        from langchain_classic.memory import (
            ConversationBufferWindowMemory,
            ConversationSummaryBufferMemory
        )
    except ImportError:
        raise ImportError(
            "Conversation memory classes not found. Run: pip install langchain-classic"
        )

from server.agents.state import AgentState
from server.azure_client import get_llm
from server.agents.cost_tracker import cost_tracker
from server.agents.error_handler import get_user_friendly_error_message, log_content_filter_violation

# Try importing from LangChain main package first
from server.storage import storage


class ConversationMemoryAgent:
    """Agent for managing conversation memory and context."""
    
    def __init__(self):
        self.name = "conversation_memory"
        self.session_memories: Dict[str, ConversationBufferWindowMemory] = {}
        self.session_summaries: Dict[str, str] = {}
        self._setup_prompts()
    
    def _setup_prompts(self):
        """Initialize memory-related prompts."""
        
        # Context-aware response prompt for CHAT routing
        self.chat_response_prompt = ChatPromptTemplate.from_template("""
You are a helpful AI assistant engaged in an ongoing conversation. 
Use the conversation history to provide contextual, relevant responses.

**Conversation History:**
{chat_history}

**Current User Question:** {query}

**Instructions:**
- Reference previous parts of the conversation when relevant
- Maintain conversation context and continuity  
- If the user refers to something you said earlier, acknowledge it specifically
- Be conversational and natural
- Don't repeat information unnecessarily unless asked for clarification

**Response:**
""")
        
        # Hybrid prompt that combines conversation + retrieved context
        self.hybrid_response_prompt = ChatPromptTemplate.from_template("""
You are a helpful AI assistant with access to both conversation history and retrieved documents.

**Conversation History:**
{chat_history}

**Retrieved Context:**
{retrieved_context}

**Current User Question:** {query}

**Instructions:**
- Use both conversation history AND retrieved documents to answer
- Reference previous conversation when relevant
- Cite sources from retrieved documents with [1], [2], etc.
- Maintain conversation flow while incorporating new information
- If information conflicts between conversation and documents, acknowledge this

**Response:**
""")
    
    def _get_or_create_memory(self, session_id: str) -> ConversationBufferWindowMemory:
        """Get or create memory for a session."""
        if session_id not in self.session_memories:
            # Use window memory to keep last 6 messages (3 exchanges)
            self.session_memories[session_id] = ConversationBufferWindowMemory(
                k=6,  # Keep last 6 messages
                return_messages=True,
                memory_key="chat_history"
            )
        return self.session_memories[session_id]
    
    async def load_conversation_history(self, session_id: str, limit: int = 10) -> None:
        """Load conversation history into memory from storage."""
        try:
            memory = self._get_or_create_memory(session_id)
            
            # Get recent messages from storage
            messages = await storage.getSessionMessages(session_id, page=1, limit=limit)
            
            # Convert to LangChain messages and add to memory
            for msg in reversed(messages):  # Add in chronological order
                content = msg.get('content', '')
                role = msg.get('role', '')
                
                if role == 'user':
                    memory.chat_memory.add_user_message(content)
                elif role == 'assistant':
                    memory.chat_memory.add_ai_message(content)
                    
        except Exception as e:
            logger.error("Error loading conversation history: %s", e, exc_info=True)
    
    def add_message_to_memory(self, session_id: str, role: str, content: str) -> None:
        """Add a new message to session memory."""
        try:
            memory = self._get_or_create_memory(session_id)
            
            if role == 'user':
                memory.chat_memory.add_user_message(content)
            elif role == 'assistant':
                memory.chat_memory.add_ai_message(content)
                
        except Exception as e:
            logger.error("Error adding message to memory: %s", e, exc_info=True)
    
    def get_conversation_context(self, session_id: str) -> str:
        """Get formatted conversation context for prompts."""
        try:
            memory = self._get_or_create_memory(session_id)
            
            # Get memory variables
            memory_vars = memory.load_memory_variables({})
            chat_history = memory_vars.get('chat_history', [])
            
            if not chat_history:
                return "No previous conversation in this session."
            
            # Format as text
            formatted_history = []
            for message in chat_history:
                if isinstance(message, HumanMessage):
                    formatted_history.append(f"User: {message.content}")
                elif isinstance(message, AIMessage):
                    formatted_history.append(f"Assistant: {message.content}")
            
            return "\n".join(formatted_history)
            
        except Exception as e:
            logger.error("Error getting conversation context: %s", e, exc_info=True)
            return "Error retrieving conversation context."
    
    async def generate_chat_response(
        self, 
        query: str, 
        session_id: str,
        enable_tracing: bool = True,
        threshold_suggestion: str = ""
    ) -> str:
        """Generate response using only conversation memory (CHAT routing)."""
        try:
            logger.debug("Received threshold_suggestion: '%s'", threshold_suggestion)
            
            # If there's a threshold suggestion, return it instead of processing normally
            if threshold_suggestion:
                logger.info("Returning threshold suggestion message")
                return threshold_suggestion
                
            # Ensure conversation history is loaded
            await self.load_conversation_history(session_id)
            
            # Get conversation context
            chat_history = self.get_conversation_context(session_id)
            
            # Get LLM
            llm = get_llm()
            if not llm:
                return "I'm sorry, but I'm unable to process your request right now due to a configuration issue."
            
            # Build chain
            chain = self.chat_response_prompt | llm | StrOutputParser()
            
            # Generate response
            response = await chain.ainvoke({
                "query": query,
                "chat_history": chat_history
            })
            
            # Add messages to memory
            self.add_message_to_memory(session_id, 'user', query)
            self.add_message_to_memory(session_id, 'assistant', response)
            
            return response
            
        except Exception as e:
            logger.error("Error generating chat response: %s", e, exc_info=True)
            return "I apologize, but I encountered an error while processing your request."
    
    async def generate_hybrid_response(
        self, 
        query: str, 
        session_id: str,
        retrieved_chunks: List[Dict[str, Any]],
        enable_tracing: bool = True
    ) -> str:
        """Generate response using both conversation memory and retrieved documents (HYBRID routing)."""
        try:
            # Ensure conversation history is loaded
            await self.load_conversation_history(session_id)
            
            # Get conversation context
            chat_history = self.get_conversation_context(session_id)
            
            # Format retrieved context
            retrieved_context = self._format_retrieved_context(retrieved_chunks)
            
            # Get LLM
            llm = get_llm()
            if not llm:
                return "I'm sorry, but I'm unable to process your request right now due to a configuration issue."
            
            # Build chain
            chain = self.hybrid_response_prompt | llm | StrOutputParser()
            
            # Generate response
            response = await chain.ainvoke({
                "query": query,
                "chat_history": chat_history,
                "retrieved_context": retrieved_context
            })
            
            # Add messages to memory
            self.add_message_to_memory(session_id, 'user', query)
            self.add_message_to_memory(session_id, 'assistant', response)
            
            return response
            
        except Exception as e:
            logger.error("Error generating hybrid response: %s", e, exc_info=True)
            log_content_filter_violation(e, "conversation_memory_agent")
            return get_user_friendly_error_message(e)
    
    def _format_retrieved_context(self, chunks: List[Dict[str, Any]]) -> str:
        """Format retrieved chunks for prompt context."""
        if not chunks:
            return "No relevant documents found."
        
        formatted_chunks = []
        for i, chunk in enumerate(chunks, 1):
            content = chunk.get('content', '')
            filename = chunk.get('filename', 'Unknown')
            score = chunk.get('score', 0.0)
            
            formatted_chunks.append(
                f"Source {i} (from {filename}, relevance: {score:.2f}):\n{content}\n"
            )
        
        return "\n".join(formatted_chunks)
    
    def clear_session_memory(self, session_id: str) -> None:
        """Clear memory for a specific session."""
        if session_id in self.session_memories:
            del self.session_memories[session_id]
        if session_id in self.session_summaries:
            del self.session_summaries[session_id]
    
    def get_memory_stats(self) -> Dict[str, Any]:
        """Get statistics about current memory usage."""
        return {
            "active_sessions": len(self.session_memories),
            "sessions_with_summaries": len(self.session_summaries),
            "total_memory_objects": len(self.session_memories) + len(self.session_summaries)
        }
    
    async def cleanup_old_sessions(self, max_age_hours: int = 24) -> int:
        """Clean up memory for old sessions."""
        # This would typically check session last activity from storage
        # For now, we'll implement a simple cleanup based on memory object count
        
        if len(self.session_memories) > 100:  # Arbitrary limit
            # Remove oldest sessions (simple approach)
            sessions_to_remove = list(self.session_memories.keys())[:50]
            for session_id in sessions_to_remove:
                self.clear_session_memory(session_id)
            return len(sessions_to_remove)
        
        return 0


# Global conversation memory agent instance
conversation_memory_agent = ConversationMemoryAgent()