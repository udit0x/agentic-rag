"""LangChain RAG chain implementation using LCEL with multi-provider support."""
from typing import List, Dict, Any
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from server.providers import get_llm
from server.providers import get_llm

# RAG prompt template with Level 2 precision tuning (hallucination reduction)
RAG_PROMPT = """You are a helpful AI assistant that answers questions based on provided document context.

CRITICAL INSTRUCTIONS - Level 2 Context Control:
Use only the retrieved content provided below. Do not infer, generalize, or add information not explicitly found in the context.

Context from documents:
{context}

Question: {question}

Instructions:
1. Answer ONLY based on the provided context above - do not add external knowledge
2. If the context doesn't contain enough information to answer the question, explicitly state this
3. Use citations in the format [1], [2], [3] etc. that correspond to the source numbers provided in the context
4. Each source is numbered starting from 1 - use these exact numbers for citations
5. Be precise and factual - avoid generalizations or assumptions
6. Use markdown formatting for better readability
7. If multiple sources provide conflicting information, acknowledge this explicitly

CITATION FORMAT:
- Use [1] for the first source, [2] for the second source, etc.
- Multiple citations can be combined like [1], [2] or [1]-[3]
- Always ensure your citation numbers match the source numbers in the context

Answer:"""

def format_docs(docs: List[Dict[str, Any]]) -> str:
    """
    Format retrieved documents for the prompt with Level 3 metadata grounding.
    
    Includes source metadata inline for concrete citations and reduced hallucination.
    """
    if not docs:
        return "No relevant documents found."
    
    # Sort by score (highest first) for quality prioritization
    sorted_docs = sorted(docs, key=lambda x: x.get('score', 0), reverse=True)
    
    formatted_chunks = []
    
    for i, doc in enumerate(sorted_docs, 1):
        # Level 3: Include source metadata inline for concrete grounding
        filename = doc.get('filename', 'unknown')
        chunk_index = doc.get('chunkIndex', 0)
        score = doc.get('score', 0)
        
        content = doc.get('content', 'Content not available')
        
        # Truncate very long content but preserve important information
        if len(content) > 1200:
            content = content[:1200] + "..."
        
        # Format with clear source numbering and attribution
        formatted_chunk = f"Source [{i}] - {filename} (chunk {chunk_index}, relevance: {score:.1%}):\n{content}"
        formatted_chunks.append(formatted_chunk)
    
    return "\n\n---\n\n".join(formatted_chunks)

async def create_rag_answer(
    query: str,
    retrieved_docs: List[Dict[str, Any]]
) -> str:
    """Generate answer using LangChain LCEL chain."""
    
    # Get the current LLM instance
    llm = get_llm()
    if not llm:
        raise ValueError("LLM not configured. Please configure LLM provider in settings.")
    
    # Create prompt template
    prompt = ChatPromptTemplate.from_template(RAG_PROMPT)
    
    # Build LCEL chain
    chain = (
        {
            "context": lambda x: format_docs(x["docs"]),
            "question": lambda x: x["query"]
        }
        | prompt
        | llm
        | StrOutputParser()
    )
    
    # Invoke chain
    answer = await chain.ainvoke({
        "query": query,
        "docs": retrieved_docs
    })
    
    return answer
