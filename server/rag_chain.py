"""LangChain RAG chain implementation using LCEL."""
from typing import List, Dict, Any
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from server.azure_client import azure_client

# RAG prompt template
RAG_PROMPT = """You are a helpful AI assistant that answers questions based on the provided context from documents.

Context from documents:
{context}

Question: {question}

Instructions:
1. Answer the question based solely on the provided context
2. Include specific citations to sources using [1], [2], etc. format
3. If the context doesn't contain enough information, say so clearly
4. Be concise but comprehensive
5. Use markdown formatting for better readability

Answer:"""

def format_docs(docs: List[Dict[str, Any]]) -> str:
    """Format retrieved documents for the prompt."""
    formatted = []
    for i, doc in enumerate(docs, 1):
        formatted.append(
            f"[{i}] {doc['filename']} (Chunk {doc['chunkIndex']})\n{doc['content']}\n"
        )
    return "\n".join(formatted)

async def create_rag_answer(
    query: str,
    retrieved_docs: List[Dict[str, Any]]
) -> str:
    """Generate answer using LangChain LCEL chain."""
    
    # Create prompt template
    prompt = ChatPromptTemplate.from_template(RAG_PROMPT)
    
    # Build LCEL chain
    chain = (
        {
            "context": lambda x: format_docs(x["docs"]),
            "question": lambda x: x["query"]
        }
        | prompt
        | azure_client.llm
        | StrOutputParser()
    )
    
    # Invoke chain
    answer = await chain.ainvoke({
        "query": query,
        "docs": retrieved_docs
    })
    
    return answer
