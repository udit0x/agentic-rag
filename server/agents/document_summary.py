"""Document Summary Agent for comprehensive document understanding."""
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from server.providers import get_llm

logger = logging.getLogger(__name__)


class DocumentSummary(BaseModel):
    """Structured summary output for a single document."""
    document_id: str = Field(description="Unique document identifier")
    document_name: str = Field(description="Document filename")
    executive_summary: str = Field(description="High-level overview (2-4 sentences)")
    key_themes: List[str] = Field(description="Main topics/themes (3-7 items)")
    main_points: List[str] = Field(description="Key takeaways (5-10 items)")
    document_type: str = Field(description="Document category (e.g., Report, Guide, Technical Doc)")
    structure_analysis: str = Field(description="Document organization and flow")
    important_entities: Dict[str, List[str]] = Field(
        description="Key entities: people, organizations, dates, locations, products",
        default_factory=dict
    )
    word_count: int = Field(description="Approximate word count")
    key_sections: List[str] = Field(description="Main sections or topics covered", default_factory=list)


class DocumentSummaryAgent:
    """
    Agent for comprehensive document understanding using AI-driven analysis.
    
    Capabilities:
    - Single document summarization with structured insights
    - Semantic slicing for efficient chunk retrieval
    - Dynamic batch sizing for large documents
    - Hierarchical summaries (executive + detailed)
    """
    
    def __init__(self):
        self.name = "document_summary"
        self._setup_prompts()
    
    def _sample_chunks_intelligently(self, chunks: List[Dict[str, Any]], target_size: int) -> List[Dict[str, Any]]:
        """
        AGGRESSIVE intelligent sampling for very large documents.
        
        Strategy for docs >200k chars:
        1. Keep first 5% (intro/context) 
        2. Keep last 5% (conclusions)
        3. Sample only 5% of middle (AGGRESSIVE - 85% total cut)
        
        LLM can still summarize accurately with 15% of content.
        This is how enterprise RAG does it.
        """
        if len(chunks) == 0:
            return chunks
        
        total_size = sum(len(chunk["content"]) for chunk in chunks)
        
        if total_size <= target_size:
            return chunks  # No sampling needed
        
        # AGGRESSIVE SAMPLING for large docs
        if total_size > 200000:  # >200k chars
            logger.info("Large doc detected (%d chars), using aggressive 5/5/5 sampling", total_size)
            
            # Keep first 5%, last 5%, sample 5% of middle = 15% total
            keep_edges = max(1, len(chunks) // 20)  # 5% = 1/20
            
            first_chunks = chunks[:keep_edges]
            last_chunks = chunks[-keep_edges:]
            middle_chunks = chunks[keep_edges:-keep_edges]
            
            # Sample only 5% of middle chunks
            middle_sample_size = max(1, len(middle_chunks) // 20)
            step = max(1, len(middle_chunks) // middle_sample_size)
            
            sampled_middle = [middle_chunks[i] for i in range(0, len(middle_chunks), step)]
            
            result = first_chunks + sampled_middle + last_chunks
            
            cut_percentage = (1 - len(result) / len(chunks)) * 100
            logger.info("Aggressive sampling: %d → %d chunks (%.1f%% cut)", len(chunks), len(result), cut_percentage)
            
            return result
        
        # Standard sampling for medium docs
        sampling_ratio = target_size / total_size
        
        # Keep first and last 10%
        keep_edges = max(1, len(chunks) // 10)
        
        first_chunks = chunks[:keep_edges]
        last_chunks = chunks[-keep_edges:]
        middle_chunks = chunks[keep_edges:-keep_edges]
        
        # Sample middle chunks evenly
        middle_target = int(len(middle_chunks) * sampling_ratio)
        step = max(1, len(middle_chunks) // middle_target) if middle_target > 0 else len(middle_chunks)
        
        sampled_middle = [middle_chunks[i] for i in range(0, len(middle_chunks), step)]
        
        # Combine: first + sampled middle + last
        result = first_chunks + sampled_middle + last_chunks
        
        logger.debug("Sampled %d chunks → %d chunks (ratio: %.2f)", len(chunks), len(result), sampling_ratio)
        
        return result
    
    async def _stitch_neighbors(
        self,
        rag_client,
        relevant_chunks: List[Dict[str, Any]],
        document_id: str,
        user_id: Optional[str]
    ) -> List[Dict[str, Any]]:
        """
        Chunk stitching: Include neighboring chunks around semantically relevant ones.
        
        For each relevant chunk, include its immediate neighbors (±1) to maintain context.
        This creates continuity without retrieving the entire document.
        
        Example: If chunk 45 is relevant, also include chunks 44 and 46.
        """
        if not relevant_chunks:
            return []
        
        # Extract chunk indices from relevant chunks
        relevant_indices = set()
        for chunk in relevant_chunks:
            idx = chunk.get("chunkIndex", 0)
            # Include the chunk itself + neighbors
            relevant_indices.add(idx - 1)  # Previous
            relevant_indices.add(idx)      # Current
            relevant_indices.add(idx + 1)  # Next
        
        # Remove negative indices
        relevant_indices = {idx for idx in relevant_indices if idx >= 0}
        
        logger.debug("Stitching: %d relevant → %d with neighbors", len(relevant_chunks), len(relevant_indices))
        
        # Retrieve all needed chunks by index
        # Note: We already have the relevant chunks, just need to fetch neighbors
        all_needed_chunks = await rag_client.semantic_search(
            query="__NEIGHBOR_RETRIEVAL__",
            top_k=len(relevant_indices) + 20,  # Some buffer
            document_ids=[document_id],
            user_id=user_id,
            min_score_threshold=0.0
        )
        
        # Filter to only chunks in our index set
        stitched_chunks = [
            chunk for chunk in all_needed_chunks
            if chunk.get("chunkIndex", -1) in relevant_indices
        ]
        
        # Sort by chunk index to maintain document order
        stitched_chunks.sort(key=lambda x: x.get("chunkIndex", 0))
        
        return stitched_chunks
    
    def _setup_prompts(self):
        """Initialize prompts for document summarization."""
        
        # Single document summary prompt
        self.single_doc_prompt = ChatPromptTemplate.from_template("""
You are an expert document analyst specializing in comprehensive document understanding and summarization.

**Document Information:**
- **Filename**: {document_name}
- **Content Length**: ~{word_count} words

**Document Content:**
{document_content}

**Your Task:**
Analyze this document thoroughly and provide a comprehensive, structured summary.

**Important Guidelines:**
1. **Read Carefully**: Understand the entire document before summarizing
2. **Be Comprehensive**: Cover all major themes and key points
3. **Extract Structure**: Identify how the document is organized
4. **Find Entities**: Note important people, organizations, dates, products, locations
5. **Be Accurate**: Base everything strictly on the document content

**Output Format (JSON):**
{{
  "document_id": "{document_id}",
  "document_name": "{document_name}",
  "executive_summary": "2-4 sentence high-level overview capturing the document's essence",
  "key_themes": ["theme1", "theme2", "theme3", ...],  // 3-7 main topics
  "main_points": ["point1", "point2", ...],  // 5-10 key takeaways
  "document_type": "Report|Guide|Technical Doc|Policy|Presentation|Article|...",
  "structure_analysis": "Description of how the document is organized (sections, flow, format)",
  "important_entities": {{
    "people": ["name1", "name2", ...],
    "organizations": ["org1", "org2", ...],
    "dates": ["date1", "date2", ...],
    "locations": ["location1", ...],
    "products": ["product1", "product2", ...]
  }},
  "word_count": {word_count},
  "key_sections": ["section1", "section2", ...]  // Main sections if identifiable
}}

**Remember**: This summary will help users quickly understand the document without reading it entirely. Be thorough and accurate!
""")
        
        # Final reduce prompt for hierarchical summarization
        self.final_reduce_prompt = ChatPromptTemplate.from_template("""
You are synthesizing section summaries into a final structured document summary.

**Document Information:**
- **Filename**: {document_name}
- **Total Sections Analyzed**: {section_count}
- **Approximate Word Count**: {word_count}

**Section Summaries:**
{combined_summaries}

**Your Task:**
Synthesize these section summaries into ONE comprehensive structured summary for the entire document.

**Critical Instructions:**
1. **Synthesize, Don't Repeat**: Create a unified summary, not a list of section summaries
2. **Extract Patterns**: Find overarching themes across all sections
3. **Identify Structure**: How do the sections relate to form the whole document?
4. **Consolidate Entities**: Merge entities mentioned across sections

**Output Format (JSON):**
{{
  "document_id": "{document_id}",
  "document_name": "{document_name}",
  "executive_summary": "2-4 sentence high-level overview of the ENTIRE document",
  "key_themes": ["theme1", "theme2", "theme3", ...],  // 3-7 main topics across ALL sections
  "main_points": ["point1", "point2", ...],  // 5-10 key takeaways from the FULL document
  "document_type": "Report|Guide|Technical Doc|Policy|Presentation|Article|...",
  "structure_analysis": "How the document is organized as a whole (based on section flow)",
  "important_entities": {{
    "people": ["name1", "name2", ...],
    "organizations": ["org1", "org2", ...],
    "dates": ["date1", "date2", ...],
    "locations": ["location1", ...],
    "products": ["product1", "product2", ...]
  }},
  "word_count": {word_count},
  "key_sections": ["section1", "section2", ...]  // Main sections identified
}}

**Remember**: You're creating ONE summary for the whole document, not summarizing summaries!
""")
    
    async def summarize_single_document(
        self,
        document_id: str,
        document_content: str,
        document_name: str,
        enable_tracing: bool = True,
        user_id: Optional[str] = None
    ) -> DocumentSummary:
        """
        Generate comprehensive AI-driven summary using existing Azure Search chunks.
        
        OPTIMIZED APPROACH:
        - Uses pre-chunked data from Azure Search (already embedded and indexed)
        - Single-pass or 2-pass hierarchical summary (NOT MapReduce)
        - 1-5 LLM calls max (not 100+)
        
        Args:
            document_id: Unique document identifier
            document_content: Full document text content (fallback only)
            document_name: Document filename
            enable_tracing: Whether to track execution time
            user_id: User ID for security isolation
            
        Returns:
            Structured DocumentSummary with comprehensive insights
        """
        start_time = datetime.now() if enable_tracing else None
        
        try:
            # Get LLM
            llm = get_llm()
            if not llm:
                raise Exception("LLM not available for document summarization")
            
            word_count = len(document_content.split())
            
            # ✅ SEMANTIC SLICING: Retrieve top relevant chunks + their neighbors
            # Instead of retrieving ALL chunks (408), get ~50-100 most relevant + neighbors
            from server.azure_client import rag_client
            
            # Check if Azure Search client is initialized
            if not rag_client or not rag_client.search_client:
                logger.warning("Azure Search not configured - summary agent requires indexed documents")
                raise Exception("Document summary is not available. Azure Search is not configured.")
            
            logger.info("Using semantic slicing for %s", document_name)
            
            # Step 1: Get semantically relevant chunks (top 50-100)
            # Use a summary-focused query to find the most informative sections
            relevant_chunks = await rag_client.semantic_search(
                query=f"summary overview key points main themes conclusion introduction {document_name}",
                top_k=80,  # Get top 80 most relevant chunks
                document_ids=[document_id],
                user_id=user_id,
                min_score_threshold=0.0
            )
            
            if relevant_chunks and len(relevant_chunks) > 0:
                logger.info("Retrieved %d semantically relevant chunks", len(relevant_chunks))
                
                # Step 2: Chunk stitching - include neighbors for context continuity
                all_chunks = await self._stitch_neighbors(
                    rag_client, relevant_chunks, document_id, user_id
                )
                
                logger.info("After neighbor stitching: %d chunks", len(all_chunks))
                # Sort chunks by index to maintain document order
                all_chunks.sort(key=lambda x: x.get("chunkIndex", 0))
                
                # Reconstruct full document from chunks
                full_text = "\n\n".join(chunk["content"] for chunk in all_chunks)
                char_count = len(full_text)
                
                logger.info("Retrieved %d chunks from Azure Search (%d chars)", len(all_chunks), char_count)
                
                # Decide: Single-pass or hierarchical based on size
                if char_count < 12000:  # ~3000 tokens
                    logger.debug("Using single-pass summary")
                    summary = await self._summarize_direct(
                        llm, document_id, full_text, document_name, word_count
                    )
                else:
                    logger.debug("Using 2-pass hierarchical summary (%d chunks)", len(all_chunks))
                    summary = await self._summarize_hierarchical_fast(
                        llm, document_id, all_chunks, document_name, word_count
                    )
            else:
                # No chunks found - document may not be properly indexed
                logger.warning("No chunks found in Azure Search for document %s", document_id)
                raise Exception("No indexed content found for this document. Please ensure the document has been fully processed and indexed.")
            
            if enable_tracing:
                duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
                logger.info("Completed in %dms", duration_ms)
            
            return summary
            
        except Exception as e:
            logger.error("Error summarizing document: %s", e, exc_info=True)
            # Fallback summary
            return DocumentSummary(
                document_id=document_id,
                document_name=document_name,
                executive_summary=f"Error generating summary: {str(e)}",
                key_themes=["Error in summarization"],
                main_points=["Unable to generate summary due to error"],
                document_type="Unknown",
                structure_analysis="Unable to analyze structure",
                important_entities={},
                word_count=len(document_content.split()),
                key_sections=[]
            )
    
    async def _summarize_direct(
        self,
        llm,
        document_id: str,
        document_content: str,
        document_name: str,
        word_count: int
    ) -> DocumentSummary:
        """Direct summarization for shorter documents."""
        import re
        import json
        
        try:
            parser = JsonOutputParser(pydantic_object=DocumentSummary)
            chain = self.single_doc_prompt | llm | parser
            
            result = await chain.ainvoke({
                "document_id": document_id,
                "document_name": document_name,
                "document_content": document_content,
                "word_count": word_count
            })
            
            return DocumentSummary(**result)
        except Exception as e:
            # Try JSON cleanup for trailing commas and markdown
            logger.warning("JSON parsing failed, attempting cleanup: %s", str(e))
            try:
                raw_response = await llm.ainvoke(self.single_doc_prompt.format(
                    document_id=document_id,
                    document_name=document_name,
                    document_content=document_content,
                    word_count=word_count
                ))
                
                # Clean JSON response
                json_str = raw_response.content
                # Remove markdown code blocks
                json_str = re.sub(r'```json\s*', '', json_str)
                json_str = re.sub(r'```\s*$', '', json_str)
                # Remove trailing commas before } or ]
                json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)
                
                # Extract JSON object
                json_match = re.search(r'\{.*\}', json_str, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                
                parsed_data = json.loads(json_str)
                return DocumentSummary(**parsed_data)
                
            except Exception as cleanup_error:
                logger.error("JSON cleanup failed: %s", cleanup_error, exc_info=True)
                raise e  # Re-raise original error
    
    async def _summarize_hierarchical_fast(
        self,
        llm,
        document_id: str,
        chunks: List[Dict[str, Any]],
        document_name: str,
        word_count: int
    ) -> DocumentSummary:
        """
        Fast hierarchical summarization using existing Azure Search chunks.
        
        GUARANTEED MAX 8 LLM CALLS strategy:
        1. Calculate dynamic batch size to cap at 7 batches (+ 1 final reduce = 8 total)
        2. For absurdly large docs, intelligently sample chunks instead of processing all
        3. Summarize batches in parallel
        4. Final synthesis
        
        Total: NEVER more than 8 LLM calls, no matter the document size
        """
        import asyncio
        
        # DYNAMIC BATCH SIZING: Ensure we never exceed 7 batches (7 parallel + 1 reduce = 8 total)
        MAX_BATCHES = 7
        
        # Calculate total content size
        total_chars = sum(len(chunk["content"]) for chunk in chunks)
        
        # Dynamic batch size calculation
        # GPT-4o has 128k context → max safe batch = ~50k chars (~12.5k tokens)
        # But we adjust based on document size to cap at MAX_BATCHES
        MIN_BATCH_SIZE = 45000  # Minimum for quality
        MAX_BATCH_SIZE = 100000  # Maximum we can fit in context (25k tokens)
        
        # Calculate required batch size to fit within MAX_BATCHES
        calculated_batch_size = total_chars // MAX_BATCHES
        
        # Clamp between min and max
        BATCH_SIZE = max(MIN_BATCH_SIZE, min(calculated_batch_size, MAX_BATCH_SIZE))
        
        logger.info("Total size: %d chars, using batch size: %d chars", total_chars, BATCH_SIZE)
        
        # If even MAX_BATCH_SIZE would create too many batches, use intelligent sampling
        if total_chars > (MAX_BATCH_SIZE * MAX_BATCHES):
            logger.info("Document too large (%d chars), using intelligent sampling", total_chars)
            chunks = self._sample_chunks_intelligently(chunks, MAX_BATCHES * MAX_BATCH_SIZE)
            total_chars = sum(len(chunk["content"]) for chunk in chunks)
            logger.info("Sampled down to %d chunks (%d chars)", len(chunks), total_chars)
        
        batches = []
        current_batch = []
        current_size = 0
        
        for chunk in chunks:
            chunk_content = chunk["content"]
            chunk_size = len(chunk_content)
            
            if current_size + chunk_size > BATCH_SIZE and current_batch:
                # Start new batch
                batches.append(current_batch)
                current_batch = [chunk_content]
                current_size = chunk_size
            else:
                current_batch.append(chunk_content)
                current_size += chunk_size
        
        # Add last batch
        if current_batch:
            batches.append(current_batch)
        
        logger.info("Grouped %d chunks into %d batches for hierarchical summary", len(chunks), len(batches))
        
        # SAFETY CHECK: If still too many batches, use two-tier hierarchy
        # Tier 1: Summarize batches in groups
        # Tier 2: Combine group summaries
        # This ensures we NEVER exceed 8 LLM calls total
        if len(batches) > MAX_BATCHES:
            logger.info("Too many batches (%d), using two-tier hierarchy", len(batches))
            return await self._summarize_two_tier(llm, batches, document_id, document_name, word_count)
        
        # Step 1: Summarize each batch in parallel
        async def summarize_batch(batch_chunks: List[str], batch_num: int):
            batch_text = "\n\n".join(batch_chunks)
            prompt = f"""Summarize this section of the document "{document_name}" (Part {batch_num}/{len(batches)}):

{batch_text}

Provide a concise summary focusing on:
- Main points and key information
- Important concepts or entities
- Critical details

Keep it under 300 words."""
            
            try:
                response = await llm.ainvoke(prompt)
                return response.content
            except Exception as e:
                logger.error("Error summarizing batch %d: %s", batch_num, e, exc_info=True)
                return f"[Error processing section {batch_num}]"
        
        # Run batch summaries in parallel (capped at MAX_BATCHES)
        batch_summary_tasks = [
            summarize_batch(batch, i + 1)
            for i, batch in enumerate(batches)
        ]
        
        batch_summaries = await asyncio.gather(*batch_summary_tasks)
        
        # Step 2: Combine batch summaries into final structured summary using dedicated reduce prompt
        combined_summaries = "\n\n".join(
            f"**Section {i+1}**: {summary}"
            for i, summary in enumerate(batch_summaries)
        )
        
        try:
            parser = JsonOutputParser(pydantic_object=DocumentSummary)
            chain = self.final_reduce_prompt | llm | parser
            
            result = await chain.ainvoke({
                "document_id": document_id,
                "document_name": document_name,
                "combined_summaries": combined_summaries,
                "section_count": len(batches),
                "word_count": word_count
            })
            
            return DocumentSummary(**result)
        except Exception as e:
            # Try JSON cleanup for trailing commas and markdown
            logger.warning("JSON parsing failed in hierarchical summary, attempting cleanup: %s", str(e))
            try:
                import re
                import json
                
                raw_response = await llm.ainvoke(self.final_reduce_prompt.format(
                    document_id=document_id,
                    document_name=document_name,
                    combined_summaries=combined_summaries,
                    section_count=len(batches),
                    word_count=word_count
                ))
                
                # Clean JSON response
                json_str = raw_response.content
                json_str = re.sub(r'```json\s*', '', json_str)
                json_str = re.sub(r'```\s*$', '', json_str)
                json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)  # Remove trailing commas
                
                json_match = re.search(r'\{.*\}', json_str, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                
                parsed_data = json.loads(json_str)
                return DocumentSummary(**parsed_data)
                
            except Exception as cleanup_error:
                logger.error("JSON cleanup failed in hierarchical: %s", cleanup_error, exc_info=True)
                raise e  # Re-raise original error
    
    async def _summarize_two_tier(
        self,
        llm,
        batches: List[List[str]],
        document_id: str,
        document_name: str,
        word_count: int
    ) -> DocumentSummary:
        """
        Two-tier hierarchical summarization for extremely large documents.
        
        Guarantees max 8 LLM calls:
        - Tier 1: Group batches into 3 mega-groups, summarize each (3 calls)
        - Tier 2: Combine 3 mega-summaries into intermediate summaries (3 calls)  
        - Tier 3: Final synthesis (1 call)
        
        Total: 7 calls + 1 final = 8 calls max
        """
        import asyncio
        
        # Group batches into 3 mega-groups
        group_size = len(batches) // 3
        mega_groups = [
            batches[i:i+group_size] for i in range(0, len(batches), group_size)
        ][:3]  # Cap at 3 groups
        
        logger.info("Two-tier: %d batches → %d mega-groups", len(batches), len(mega_groups))
        
        # Tier 1: Summarize each mega-group in parallel
        async def summarize_mega_group(group_batches: List[List[str]], group_num: int):
            # Flatten all batches in this group
            all_chunks_in_group = []
            for batch in group_batches:
                all_chunks_in_group.extend(batch)
            
            group_text = "\n\n".join(all_chunks_in_group)
            
            prompt = f"""Summarize this major section of the document "{document_name}" (Part {group_num}/3):

{group_text}

Focus on:
- Main themes and arguments
- Key findings or conclusions
- Important entities and facts
- Critical insights

Keep it under 500 words."""
            
            try:
                response = await llm.ainvoke(prompt)
                return response.content
            except Exception as e:
                logger.error("Error summarizing mega-group %d: %s", group_num, e, exc_info=True)
                return f"[Error processing mega-group {group_num}]"
        
        # Process mega-groups in parallel (max 3 calls)
        mega_tasks = [
            summarize_mega_group(group, i + 1)
            for i, group in enumerate(mega_groups)
        ]
        
        mega_summaries = await asyncio.gather(*mega_tasks)
        
        # Tier 2: Combine mega-summaries into final structured summary
        combined = "\n\n".join(
            f"**Part {i+1}/3**: {summary}"
            for i, summary in enumerate(mega_summaries)
        )
        
        try:
            parser = JsonOutputParser(pydantic_object=DocumentSummary)
            chain = self.final_reduce_prompt | llm | parser
            
            result = await chain.ainvoke({
                "document_id": document_id,
                "document_name": document_name,
                "combined_summaries": combined,
                "section_count": 3,
                "word_count": word_count
            })
            
            return DocumentSummary(**result)
        except Exception as e:
            # Try JSON cleanup for trailing commas and markdown
            logger.warning("JSON parsing failed in two-tier summary, attempting cleanup: %s", str(e))
            try:
                import re
                import json
                
                raw_response = await llm.ainvoke(self.final_reduce_prompt.format(
                    document_id=document_id,
                    document_name=document_name,
                    combined_summaries=combined,
                    section_count=3,
                    word_count=word_count
                ))
                
                # Clean JSON response
                json_str = raw_response.content
                json_str = re.sub(r'```json\s*', '', json_str)
                json_str = re.sub(r'```\s*$', '', json_str)
                json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)  # Remove trailing commas
                
                json_match = re.search(r'\{.*\}', json_str, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                
                parsed_data = json.loads(json_str)
                return DocumentSummary(**parsed_data)
                
            except Exception as cleanup_error:
                logger.error("JSON cleanup failed in two-tier: %s", cleanup_error, exc_info=True)
                raise e  # Re-raise original error
    
    def create_trace(
        self,
        document_ids: List[str],
        summary_result: Any,
        start_time: datetime,
        error: str = None
    ) -> Dict[str, Any]:
        """Create execution trace for this agent."""
        end_time = datetime.now()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)
        
        return {
            "agent_name": "document_summary",
            "start_time": start_time,
            "end_time": end_time,
            "input_data": {"document_ids": document_ids, "document_count": len(document_ids)},
            "output_data": {
                "summary_type": "multi" if len(document_ids) > 1 else "single",
                "documents_processed": len(document_ids)
            } if not error else None,
            "error": error,
            "duration_ms": duration_ms
        }


# Global document summary agent instance
document_summary_agent = DocumentSummaryAgent()
