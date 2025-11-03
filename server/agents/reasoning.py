"""Reasoning Agent for standard factual synthesis."""
from typing import List, Dict, Any
from datetime import datetime
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from server.providers import get_llm
from server.agents.state import DocumentChunk, QueryClassification, AgentTrace
from server.config_manager import config_manager

# Enhanced reasoning prompt template
REASONING_PROMPT = """You are an expert knowledge analyst that synthesizes information from documents to answer questions accurately and comprehensively.

Retrieved Context:
{context}

Question: {question}

Classification: {classification_type} (Confidence: {confidence})

General Knowledge Available: {use_general_knowledge}

Instructions:
1. **Primary Source**: Base your answer on the provided document context first
2. **Source Attribution**: Use numbered citations [1], [2], etc. that correspond to source documents
3. **Accuracy**: When using document context, be strictly factual and avoid adding external knowledge
4. **Hybrid Response**: If context is limited and general knowledge is available, you may supplement with foundational knowledge but clearly indicate this
5. **Clear Separation**: Distinguish between document-based information and general knowledge
6. **Completeness**: Provide a comprehensive answer using the best available information
7. **Citations**: Include specific citations for document-based claims

If using both document context and general knowledge:
- Start with document-based information (with citations)
- Clearly indicate when supplementing with general knowledge
- Use phrases like "Based on the documents:" and "From general knowledge:"

Format your response as:
- **Document-based answer** with proper citations (if documents available)
- **Additional context** from general knowledge (if applicable and enabled)
- **Information gaps** if neither source is sufficient

Answer:"""

# Hybrid reasoning prompt for when documents are insufficient
HYBRID_REASONING_PROMPT = """You are providing a comprehensive answer using both document context and general knowledge.

Retrieved Context:
{context}

Question: {question}

Classification: {classification_type} (Confidence: {confidence})

Situation: You have some document context but it may not fully answer the question. You are allowed to supplement with general knowledge to provide a more complete response.

Instructions:
1. **Start with Documents**: Begin with any relevant information from the provided documents
2. **Clear Attribution**: Use citations [1], [2], etc. for document-based information
3. **Supplement Carefully**: Add general knowledge only where it helps complete the answer
4. **Clear Distinction**: Clearly separate document-based vs. general knowledge information
5. **Accuracy**: Be factual and avoid speculation in both document and general knowledge sections
6. **Helpful**: Provide a complete, useful answer that addresses the user's question

Format:
**Based on your documents:**
[Document-based information with citations]

**Additional context from general knowledge:**
[Supplementary information clearly marked as general knowledge]

**Summary:**
[Brief synthesis if helpful]

Answer:"""

class ReasoningAgent:
    """Agent responsible for standard factual synthesis and reasoning."""
    
    def __init__(self):
        # Get LLM dynamically from provider
        self.llm = None
        self.prompt = ChatPromptTemplate.from_template(REASONING_PROMPT)
        self.hybrid_prompt = ChatPromptTemplate.from_template(HYBRID_REASONING_PROMPT)
        self.reasoning_chain = None
        self.hybrid_chain = None
    
    def _get_llm(self):
        """Get the current LLM instance."""
        if self.llm is None:
            try:
                self.llm = get_llm()
                # Rebuild chains when LLM is available
                self._build_chains()
            except Exception as e:
                print(f"[REASONING_AGENT] Error getting LLM: {e}")
                return None
        return self.llm
    
    def _get_use_general_knowledge(self) -> bool:
        """Get the current useGeneralKnowledge setting from config."""
        try:
            config = config_manager.get_current_config()
            return config.useGeneralKnowledge if config else True
        except Exception as e:
            print(f"[REASONING_AGENT] Error getting useGeneralKnowledge config: {e}")
            return True  # Default to True
    
    def _build_chains(self):
        """Build the reasoning chains with current LLM."""
        if self.llm:
            # Standard reasoning chain
            self.reasoning_chain = (
                {
                    "context": lambda x: self._format_context(x["chunks"]),
                    "question": lambda x: x["query"],
                    "classification_type": lambda x: x["classification"]["type"],
                    "confidence": lambda x: x["classification"]["confidence"],
                    "use_general_knowledge": lambda x: x["use_general_knowledge"]
                }
                | self.prompt
                | self.llm
                | StrOutputParser()
            )
            
            # Hybrid reasoning chain (documents + general knowledge)
            self.hybrid_chain = (
                {
                    "context": lambda x: self._format_context(x["chunks"]),
                    "question": lambda x: x["query"],
                    "classification_type": lambda x: x["classification"]["type"],
                    "confidence": lambda x: x["classification"]["confidence"]
                }
                | self.hybrid_prompt
                | self.llm
                | StrOutputParser()
            )
    
    def _format_context(self, chunks: List[DocumentChunk]) -> str:
        """Format document chunks for the prompt."""
        if not chunks:
            return "No relevant documents found."
        
        formatted_chunks = []
        for i, chunk in enumerate(chunks, 1):
            formatted_chunks.append(
                f"[{i}] **{chunk['filename']}** (Chunk {chunk['chunkIndex']}, Score: {chunk['score']:.3f})\n"
                f"{chunk['content']}\n"
            )
        
        return "\n".join(formatted_chunks)
    
    def _should_use_hybrid_mode(
        self, 
        chunks: List[DocumentChunk], 
        classification: QueryClassification
    ) -> bool:
        """Determine if hybrid mode (documents + general knowledge) should be used."""
        use_general_knowledge = self._get_use_general_knowledge()
        
        if not use_general_knowledge:
            return False
        
        # Use hybrid mode if:
        # 1. We have some documents but not many (suggests incomplete coverage)
        # 2. The documents seem limited in scope
        # 3. The query classification suggests it might benefit from general knowledge
        
        if not chunks:
            return False  # No documents - should use pure general knowledge instead
        
        if len(chunks) == 1:
            return True  # Single document might not be comprehensive
        
        if len(chunks) <= 2 and classification.get("confidence", 0) < 0.8:
            return True  # Few documents and uncertain classification
        
        # Check if documents seem to have limited content
        avg_content_length = sum(len(chunk["content"]) for chunk in chunks) / len(chunks)
        if avg_content_length < 500:  # Short chunks might need supplementation
            return True
        
        return False
        """Format document chunks for the prompt."""
        if not chunks:
            return "No relevant documents found."
        
        formatted_chunks = []
        for i, chunk in enumerate(chunks, 1):
            formatted_chunks.append(
                f"[{i}] **{chunk['filename']}** (Chunk {chunk['chunkIndex']}, Score: {chunk['score']:.3f})\n"
                f"{chunk['content']}\n"
            )
        
        return "\n".join(formatted_chunks)
    
    def _fallback_reasoning(
        self, 
        query: str, 
        chunks: List[DocumentChunk]
    ) -> str:
        """Fallback reasoning when LLM is unavailable."""
        use_general_knowledge = self._get_use_general_knowledge()
        print(f"[REASONING_AGENT] Fallback reasoning called, chunks={len(chunks)}, useGeneralKnowledge={use_general_knowledge}")
        
        if not chunks:
            if use_general_knowledge:
                return "I couldn't find any relevant information in the uploaded documents. However, general knowledge responses are enabled, so this should have been handled by the general knowledge agent."
            else:
                print(f"[REASONING_AGENT] Fallback: Returning disabled message since useGeneralKnowledge=False")
                return "I couldn't find any relevant information in the uploaded documents to answer your question. General knowledge responses are currently disabled. Please upload documents that contain information related to your query, or enable general knowledge responses in Settings."
        
        # Simple template-based response
        response = f"Based on the uploaded documents, here's what I found:\n\n"
        
        for i, chunk in enumerate(chunks[:3], 1):  # Limit to top 3 for fallback
            response += f"**From {chunk['filename']}:**\n"
            response += f"{chunk['content'][:300]}{'...' if len(chunk['content']) > 300 else ''}\n\n"
        
        response += f"\\nThis information comes from {len(chunks)} relevant document{'s' if len(chunks) > 1 else ''}."
        
        return response
    
    async def generate_response(
        self,
        query: str,
        chunks: List[DocumentChunk],
        classification: QueryClassification,
        enable_tracing: bool = True
    ) -> str:
        """
        Generate a factual response based on retrieved documents.
        
        Args:
            query: User's question
            chunks: Retrieved document chunks
            classification: Query classification
            enable_tracing: Whether to track execution time
            
        Returns:
            Synthesized response with citations
        """
        start_time = datetime.now() if enable_tracing else None
        use_general_knowledge = self._get_use_general_knowledge()
        
        try:
            # Ensure LLM is available
            llm = self._get_llm()
            if not llm or not self.reasoning_chain:
                return self._fallback_reasoning(query, chunks)

            if not chunks:
                print(f"[REASONING_AGENT] No chunks found, useGeneralKnowledge={use_general_knowledge}")
                if use_general_knowledge:
                    # This case should not happen as it should route to general knowledge agent
                    return "I couldn't find any relevant information in the uploaded documents. However, general knowledge responses are enabled, so this should have been handled by the general knowledge agent."
                else:
                    # General knowledge is disabled - provide clear message
                    print(f"[REASONING_AGENT] Returning disabled message since useGeneralKnowledge=False")
                    return "I couldn't find any relevant information in the uploaded documents to answer your question. General knowledge responses are currently disabled. Please upload documents that contain information related to your query, or enable general knowledge responses in Settings."            # Determine if we should use hybrid mode
            should_use_hybrid = self._should_use_hybrid_mode(chunks, classification)
            
            if should_use_hybrid and self.hybrid_chain:
                print(f"[REASONING_AGENT] Using hybrid mode (documents + general knowledge)")
                # Generate response using hybrid chain
                response = await self.hybrid_chain.ainvoke({
                    "query": query,
                    "chunks": chunks,
                    "classification": classification
                })
            else:
                print(f"[REASONING_AGENT] Using standard document-only mode")
                # Generate response using standard chain
                response = await self.reasoning_chain.ainvoke({
                    "query": query,
                    "chunks": chunks,
                    "classification": classification,
                    "use_general_knowledge": use_general_knowledge
                })
            
            return response
            
        except Exception as e:
            print(f"Reasoning Agent error: {e}")
            return self._fallback_reasoning(query, chunks)
    
    def create_trace(
        self,
        query: str,
        chunks: List[DocumentChunk],
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
            "chunks_used": len(chunks),
            "classification_type": classification["type"]
        } if not error else None
        
        return AgentTrace(
            agent_name="reasoning",
            start_time=start_time,
            end_time=end_time,
            input_data={
                "query": query,
                "chunks_count": len(chunks),
                "classification": classification
            },
            output_data=output_data,
            error=error,
            duration_ms=duration_ms
        )

# Global reasoning agent instance
reasoning_agent = ReasoningAgent()