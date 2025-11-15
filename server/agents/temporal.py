"""Temporal Agent for detecting knowledge evolution and conflicts across time periods."""
import logging
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from collections import defaultdict
import re
from statistics import mean

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from pydantic import BaseModel

from server.providers import get_llm
from server.agents.state import DocumentChunk, TemporalAnalysis
from server.azure_client import azure_client

logger = logging.getLogger(__name__)


class TemporalConflict(BaseModel):
    """Represents a conflict between different time periods."""
    topic: str
    older_info: str
    newer_info: str
    older_date: datetime
    newer_date: datetime
    confidence: float
    chunk_ids: List[str]


class TimelineEvent(BaseModel):
    """Represents an event in the document timeline."""
    date: datetime
    description: str
    chunk_id: str
    document_id: str
    change_type: str  # "addition", "modification", "contradiction"


class TemporalAgent:
    """
    Agent for temporal reasoning and knowledge evolution detection.
    
    Capabilities:
    - Cluster documents by date/timestamp
    - Detect contradictions across time periods
    - Generate timeline of knowledge evolution
    - Flag outdated information
    """
    
    def __init__(self):
        self.name = "temporal"
        self._setup_prompts()
    
    def _setup_prompts(self):
        """Initialize prompts for temporal analysis."""
        
        # Comprehensive temporal analysis prompt
        self.temporal_analysis_prompt = ChatPromptTemplate.from_template("""
You are an expert temporal analyst specialized in understanding how information, capabilities, and knowledge evolve over time. 

**User Query**: "{query}"

**Document Sources with Context**:
{document_content}

**CRITICAL INSTRUCTIONS**:
1. **Source Awareness**: Pay close attention to document types and sources. Do NOT mix information from different products/systems.
2. **Query Focus**: Only analyze documents that are DIRECTLY relevant to the user's query. Ignore off-topic documents.
3. **Product Separation**: If documents are about different products (e.g., Copilot Studio vs Power BI), clearly state this and focus only on the relevant product.
4. **Relevance Filtering**: Use the search relevance scores to prioritize which documents to analyze.

**Your Task**: Analyze the temporal evolution of information related to the user's query. Be intelligent and contextual - understand what the user is asking about and focus your analysis on that specific domain.

**Before Analysis**:
- Identify which documents are actually relevant to the query
- Filter out any documents that are about different products/topics
- If no relevant documents exist, state this clearly

**Response Format** (JSON):
{{
    "analysis_focus": "Brief description of what aspect you're analyzing based on the query",
    "relevant_documents": ["List of document names that are actually relevant to the query"],
    "excluded_documents": ["List of documents excluded due to irrelevance with reasons"],
    "timeline_events": [
        {{
            "date": "YYYY-MM-DD or time period",
            "event_type": "introduction|enhancement|change|deprecation|update",
            "description": "Clear description of what happened",
            "significance": "Why this change matters",
            "confidence": 0.0-1.0,
            "source_document": "Which document this comes from"
        }}
    ],
    "conflicts_detected": [
        {{
            "topic": "What area has conflicting information",
            "conflict_description": "Description of the contradiction",
            "older_information": "What was stated earlier",
            "newer_information": "What is stated more recently",
            "resolution": "Which information should be trusted and why",
            "confidence": 0.0-1.0,
            "affected_documents": ["Documents involved in the conflict"]
        }}
    ],
    "evolution_summary": "High-level narrative of how things have evolved (only for relevant documents)",
    "current_state": "What is the most up-to-date information (only for the queried topic)",
    "outdated_items": [
        {{
            "information": "Specific outdated information",
            "reason": "Why it's outdated",
            "replacement": "What current information replaces it",
            "source_document": "Which document contains this outdated info"
        }}
    ],
    "analysis_confidence": 0.0-1.0,
    "recommendations": "Any recommendations for the user based on the temporal analysis",
    "data_quality_note": "Note about document relevance, mixed sources, or analysis limitations"
}}

**Key Principles**:
- **RELEVANCE FIRST**: Only analyze documents that are directly related to the user's query
- **SOURCE SEPARATION**: Never mix information from different products/systems
- **CLARITY**: If documents are not relevant, say so clearly
- **ACCURACY**: Better to say "no relevant temporal data found" than to mix unrelated information
- **CONTEXT**: Understand what the user actually wants to know
""")
    
    async def process(
        self, 
        query: str, 
        chunks: List[DocumentChunk]
    ) -> TemporalAnalysis:
        """
        Process chunks for temporal analysis using AI-driven approach.
        
        Args:
            query: The user's query
            chunks: Retrieved document chunks
            
        Returns:
            TemporalAnalysis with timeline, conflicts, and outdated info
        """
        try:
            # Prepare document content with intelligent date extraction
            document_content = self._prepare_document_content(chunks)
            
            # Get LLM for analysis
            llm = get_llm()
            if not llm:
                return self._fallback_temporal_analysis(chunks)
            
            # Create analysis chain
            from langchain_core.output_parsers import JsonOutputParser
            parser = JsonOutputParser()
            chain = self.temporal_analysis_prompt | llm | parser
            
            # Perform comprehensive temporal analysis
            analysis_result = await chain.ainvoke({
                "query": query,
                "document_content": document_content
            })
            
            # Extract timeline events
            timeline_events = []
            for event in analysis_result.get("timeline_events", []):
                timeline_events.append({
                    "date": event.get("date", "Unknown"),
                    "description": f"{event.get('description', '')} - {event.get('significance', '')}",
                    "change_type": event.get("event_type", "unknown"),
                    "confidence": event.get("confidence", 0.5)
                })
            
            # Extract conflicts
            conflicts = []
            for conflict in analysis_result.get("conflicts_detected", []):
                conflicts.append({
                    "topic": conflict.get("topic", ""),
                    "description": conflict.get("conflict_description", ""),
                    "older_info": conflict.get("older_information", ""),
                    "newer_info": conflict.get("newer_information", ""),
                    "resolution": conflict.get("resolution", ""),
                    "confidence": conflict.get("confidence", 0.5)
                })
            
            # Extract outdated information
            outdated_info = []
            for item in analysis_result.get("outdated_items", []):
                outdated_info.append(f"{item.get('information', '')} (Reason: {item.get('reason', '')})")
            
            # Determine most recent date from chunks
            most_recent_date = self._find_most_recent_date(chunks)
            
            # Use AI-provided confidence score
            confidence_score = analysis_result.get("analysis_confidence", 0.5)
            
            # Add evolution summary and recommendations to the analysis
            evolution_summary = analysis_result.get("evolution_summary", "")
            current_state = analysis_result.get("current_state", "")
            recommendations = analysis_result.get("recommendations", "")
            data_quality_note = analysis_result.get("data_quality_note", "")
            
            # Store additional context for response formatting
            additional_context = {
                "analysis_focus": analysis_result.get("analysis_focus", ""),
                "evolution_summary": evolution_summary,
                "current_state": current_state,
                "recommendations": recommendations,
                "relevant_documents": analysis_result.get("relevant_documents", []),
                "excluded_documents": analysis_result.get("excluded_documents", []),
                "data_quality_note": data_quality_note
            }
            
            return TemporalAnalysis(
                timeline=timeline_events,
                conflicts=conflicts,
                outdated_information=outdated_info,
                most_recent_date=most_recent_date,
                confidence_score=confidence_score,
                **additional_context  # Add extra context
            )
            
        except Exception as e:
            logger.error("Temporal Agent error: %s", e, exc_info=True)
            return self._fallback_temporal_analysis(chunks)
    
    def _prepare_document_content(self, chunks: List[DocumentChunk]) -> str:
        """Prepare document content for AI analysis with intelligent context and source separation."""
        if not chunks:
            return "No documents provided for analysis."
        
        # Group chunks by document for better context
        docs_by_source = {}
        for chunk in chunks:
            doc_id = chunk.get('documentId', f"doc_{chunk.get('filename', 'unknown')}")
            filename = chunk.get('filename', f'Document {doc_id}')
            
            if doc_id not in docs_by_source:
                docs_by_source[doc_id] = {
                    'filename': filename,
                    'chunks': [],
                    'metadata': chunk.get('metadata', {})
                }
            docs_by_source[doc_id]['chunks'].append(chunk)
        
        formatted_content = []
        
        for doc_id, doc_info in docs_by_source.items():
            filename = doc_info['filename']
            chunks_list = doc_info['chunks']
            metadata = doc_info['metadata']
            
            # Extract document-level information
            date_info = "Date not specified"
            document_type = "General Document"
            
            if 'uploadedAt' in metadata:
                try:
                    date_info = f"Uploaded: {metadata['uploadedAt']}"
                except:
                    pass
            
            # Infer document type from filename and content
            filename_lower = filename.lower()
            first_chunk_content = chunks_list[0]['content'].lower() if chunks_list else ""
            
            if any(term in filename_lower for term in ['copilot', 'studio']):
                document_type = "Microsoft Copilot Studio Documentation"
            elif any(term in filename_lower for term in ['power', 'bi', 'powerbi']):
                document_type = "Power BI Documentation"
            elif any(term in filename_lower for term in ['azure', 'cloud']):
                document_type = "Azure Documentation"
            elif any(term in first_chunk_content for term in ['copilot studio', 'microsoft copilot studio']):
                document_type = "Microsoft Copilot Studio Documentation"
            elif any(term in first_chunk_content for term in ['power bi', 'powerbi']):
                document_type = "Power BI Documentation"
            
            # Calculate relevance score from chunks
            avg_score = sum(chunk.get('score', 0.0) for chunk in chunks_list) / len(chunks_list)
            
            # Format document section
            formatted_content.append(f"""
**DOCUMENT SOURCE: {filename}**
Document Type: {document_type}
{date_info}
Search Relevance: {avg_score:.1%}
Chunk Count: {len(chunks_list)}

CONTENT:
{self._combine_chunk_content(chunks_list)}

---
""")
        
        return "\n".join(formatted_content)
    
    def _combine_chunk_content(self, chunks: List[DocumentChunk]) -> str:
        """Combine multiple chunks from the same document intelligently."""
        if not chunks:
            return ""
        
        if len(chunks) == 1:
            return chunks[0]['content']
        
        # For multiple chunks, show the most relevant ones with context
        sorted_chunks = sorted(chunks, key=lambda x: x.get('score', 0.0), reverse=True)
        
        combined_content = []
        for i, chunk in enumerate(sorted_chunks[:3]):  # Limit to top 3 chunks per document
            score = chunk.get('score', 0.0)
            content = chunk['content']
            
            # Truncate very long content
            if len(content) > 800:
                content = content[:800] + "..."
            
            combined_content.append(f"[Chunk {i+1}, Relevance: {score:.1%}]\n{content}")
        
        if len(sorted_chunks) > 3:
            combined_content.append(f"\n[... {len(sorted_chunks) - 3} additional chunks from this document]")
        
        return "\n\n".join(combined_content)
    
    def _find_most_recent_date(self, chunks: List[DocumentChunk]) -> Optional[datetime]:
        """Find the most recent date from chunks using intelligent extraction."""
        dates = []
        
        for chunk in chunks:
            # Check metadata first
            metadata = chunk.get('metadata', {})
            if 'uploadedAt' in metadata:
                try:
                    date = datetime.fromisoformat(metadata['uploadedAt'].replace('Z', '+00:00'))
                    dates.append(date)
                except:
                    pass
            
            # Try to extract from content using patterns but more flexibly
            content = chunk.get('content', '')
            
            # Look for year patterns as a simple heuristic
            import re
            year_matches = re.findall(r'\b(20\d{2})\b', content)
            if year_matches:
                try:
                    # Use the latest year found
                    latest_year = max(int(year) for year in year_matches)
                    dates.append(datetime(latest_year, 12, 31))  # End of year as approximation
                except:
                    pass
        
        # Return the most recent date found, or None if no dates were found
        return max(dates) if dates else None
    
    def _fallback_temporal_analysis(self, chunks: List[DocumentChunk]) -> TemporalAnalysis:
        """Fallback temporal analysis when AI processing fails."""
        return TemporalAnalysis(
            timeline=[{
                "date": "Unknown",
                "description": f"Analysis of {len(chunks)} document(s) - AI processing unavailable",
                "change_type": "fallback",
                "confidence": 0.1
            }],
            conflicts=[],
            outdated_information=["AI temporal analysis temporarily unavailable"],
            most_recent_date=None,  # Don't default to current date
            confidence_score=0.1,
            analysis_focus="Fallback analysis",
            evolution_summary="Unable to perform detailed temporal analysis",
            current_state="Analysis requires AI processing",
            recommendations="Please try again later when AI services are available"
        )


# Create global instance
temporal_agent = TemporalAgent()