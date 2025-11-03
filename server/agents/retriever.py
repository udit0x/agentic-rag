"""Retriever Agent for document search and ranking."""
from typing import List, Dict, Any, Optional
from datetime import datetime
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from server.azure_client import azure_client
from server.agents.state import DocumentChunk, QueryClassification, AgentTrace
from server.config_manager import config_manager

class RetrieverAgent:
    """Agent responsible for retrieving relevant document chunks."""
    
    def __init__(self):
        self.azure_client = azure_client
    
    def _get_use_general_knowledge(self) -> bool:
        """Get the current useGeneralKnowledge setting from config."""
        try:
            config = config_manager.get_current_config()
            use_gk = config.useGeneralKnowledge if config else True
            print(f"[RETRIEVER_AGENT] useGeneralKnowledge = {use_gk}, config_source = {config.source if config else 'none'}")
            return use_gk
        except Exception as e:
            print(f"[RETRIEVER_AGENT] Error getting useGeneralKnowledge config: {e}")
            return True  # Default to True
    
    def _enhance_query_for_type(
        self, 
        query: str, 
        classification: QueryClassification
    ) -> str:
        """Enhance query based on classification type."""
        if classification["type"] == "temporal":
            # Add temporal context to query
            enhanced = f"{query} recent current latest updated"
            if classification["temporal_indicators"]:
                enhanced += f" {' '.join(classification['temporal_indicators'])}"
            return enhanced
        
        elif classification["type"] == "counterfactual":
            # Focus on numerical and scenario-related content
            enhanced = f"{query} scenario analysis calculation projection"
            return enhanced
        
        else:  # factual
            return query
    
    async def _apply_metadata_filters(
        self, 
        results: List[Dict[str, Any]], 
        classification: QueryClassification
    ) -> List[Dict[str, Any]]:
        """DISABLED: Apply AI-driven post-retrieval filtering based on classification."""
        # PERFORMANCE OPTIMIZATION: Disabled AI metadata filtering
        print("[RETRIEVER] AI metadata filtering disabled for performance")
        return results
        
        try:
            from server.providers import get_llm
            from langchain_core.prompts import ChatPromptTemplate
            from langchain_core.output_parsers import JsonOutputParser
            
            llm = get_llm()
            if not llm:
                print("[RETRIEVER] AI metadata filtering unavailable, using basic filtering")
                return results
            
            # AI-driven classification-aware filtering
            classification_prompt = ChatPromptTemplate.from_template("""
You are an expert at optimizing document selection based on query classification and intent.

**Query Classification**: {classification_type}
**Query Details**: {classification_info}

**Available Documents**:
{documents_summary}

**Instructions**:
Based on the query classification, determine how to best filter and optimize the document selection:

For **TEMPORAL** queries: Prioritize documents with dates, version info, change indicators
For **COUNTERFACTUAL** queries: Prioritize documents with numerical data, scenarios, calculations  
For **FACTUAL** queries: Prioritize comprehensive, authoritative content

**Response Format** (JSON):
{{
    "optimization_strategy": "Description of the approach for this query type",
    "document_priorities": [
        {{
            "document_id": "doc_id", 
            "priority_score": 0.0-1.0,
            "reasoning": "Why this document is prioritized for this query type"
        }}
    ],
    "filtering_recommendation": "keep_all|moderate_filter|aggressive_filter"
}}
""")
            
            documents_summary = self._prepare_documents_for_ai_assessment(results)
            classification_info = {
                "type": classification["type"],
                "confidence": classification["confidence"],
                "reasoning": classification["reasoning"],
                "keywords": classification["keywords"],
                "temporal_indicators": classification.get("temporal_indicators", [])
            }
            
            parser = JsonOutputParser()
            chain = classification_prompt | llm | parser
            
            optimization_result = await chain.ainvoke({
                "classification_type": classification["type"],
                "classification_info": str(classification_info),
                "documents_summary": documents_summary
            })
            
            # Apply AI-driven optimization
            optimized_results = self._apply_ai_optimization(results, optimization_result)
            
            print(f"[RETRIEVER] AI optimization ({classification['type']}): {len(results)} -> {len(optimized_results)} documents")
            
            return optimized_results
            
        except Exception as e:
            print(f"[RETRIEVER] AI metadata filtering error: {e}, returning original results")
            return results
    
    def _apply_ai_optimization(
        self, 
        results: List[Dict[str, Any]], 
        optimization: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Apply AI-driven optimization based on classification."""
        priorities = optimization.get("document_priorities", [])
        filtering_rec = optimization.get("filtering_recommendation", "keep_all")
        
        # Create priority mapping
        priority_map = {}
        for priority_info in priorities:
            doc_id = priority_info.get("document_id", "")
            priority_score = priority_info.get("priority_score", 0.5)
            priority_map[doc_id] = priority_score
        
        # Apply optimization
        optimized_results = []
        for result in results:
            doc_id = result.get("id", "")
            original_score = result.get("score", 0.0)
            priority_score = priority_map.get(doc_id, 0.5)
            
            # Calculate optimized score
            optimized_score = (original_score * 0.6) + (priority_score * 0.4)
            result["classification_priority"] = priority_score
            result["optimized_score"] = optimized_score
            
            # Apply filtering based on recommendation
            should_include = True
            if filtering_rec == "aggressive_filter" and priority_score < 0.6:
                should_include = False
            elif filtering_rec == "moderate_filter" and priority_score < 0.3:
                should_include = False
            
            if should_include:
                optimized_results.append(result)
        
        # Sort by optimized score
        optimized_results.sort(key=lambda x: x.get("optimized_score", 0), reverse=True)
        
        return optimized_results
    
    async def _filter_relevant_results(
        self, 
        results: List[Dict[str, Any]], 
        query: str,
        classification: QueryClassification
    ) -> List[Dict[str, Any]]:
        """SMART AI-driven relevance filtering - only when needed for accuracy."""
        if not results:
            return results
        
        # If we have few results, don't filter aggressively
        if len(results) <= 3:
            print("[RETRIEVER] Few results, skipping AI filtering")
            return results
        
        try:
            from server.providers import get_llm
            from langchain_core.prompts import ChatPromptTemplate
            from langchain_core.output_parsers import JsonOutputParser
            
            llm = get_llm()
            if not llm:
                # Fallback: return all results if AI is unavailable
                print("[RETRIEVER] AI filtering unavailable, returning all results")
                return results
            
            # SIMPLIFIED AI-driven relevance assessment prompt - comparative query aware
            relevance_prompt = ChatPromptTemplate.from_template("""
            You are an expert at evaluating document relevance for user search queries in a RAG system.

            **User Query:** "{query}"  
            **Query Type:** {query_type}  

            **Candidate Documents (summarized):**  
            {documents_summary}

            ### TASK
            Select which documents are **most relevant** for answering the query, considering user intent and information completeness.

            ---

            ### QUERY TYPE GUIDELINES
            - **COMPARATIVE:** Keep documents covering both (or all) entities being compared.  
            - **COMPREHENSIVE:** Retain diverse documents for broad, complete understanding.  
            - **MULTI-FACETED:** Include docs that address different subtopics or angles.  
            - **FACTUAL:** Keep only directly relevant, precise documents.  
            - **TEMPORAL:** Prioritize the most recent or time-specific information.  
            - **PROCEDURAL:** Focus on documents with steps, methods, or workflows.

            ---

            ### ANALYSIS STEPS
            1. **Assess query scope:** Does the query demand narrow facts or broad coverage?  
            2. **Evaluate coverage:** Do multiple docs complement each other or overlap?  
            3. **Infer user intent:** Are they comparing, learning, or solving a problem?  

            ---

            ### RESPONSE FORMAT (JSON)
            {{
            "relevant_document_ids": ["doc1_id", "doc2_id", "doc3_id"],
            "filtering_strategy": "focused_selection|keep_most|keep_all|balanced_comparison|comprehensive_coverage",
            "information_coverage_assessment": "single_source_sufficient|multiple_sources_needed|diverse_perspectives_required",
            "reasoning": "Concise justification describing how the chosen documents best satisfy user intent and coverage requirements."
            }}

            ---

            ### FILTERING STRATEGY DEFINITIONS
            - **focused_selection:** Few topically exact docs suffice.  
            - **keep_most:** Majority relevant, a few off-topic.  
            - **keep_all:** Every document adds value.  
            - **balanced_comparison:** Needed for A-vs-B or similar queries.  
            - **comprehensive_coverage:** Broad topic, multiple sources required.
            """)

            
            # Prepare simplified document summary
            documents_summary = self._prepare_simple_documents_summary(results)
            
            # Determine query type for better filtering
            query_type = classification.get("type", "factual")
            if any(word in query.lower() for word in ["difference", "compare", "vs", "versus", "between"]):
                query_type = "comparative"
            
            parser = JsonOutputParser()
            chain = relevance_prompt | llm | parser
            
            # Get AI assessment
            assessment = await chain.ainvoke({
                "query": query,
                "query_type": query_type,
                "documents_summary": documents_summary
            })
            
            # Apply smart filtering
            filtered_results = self._apply_smart_filtering(results, assessment)
            
            print(f"[RETRIEVER] Smart AI filtering: {len(results)} -> {len(filtered_results)} documents")
            
            return filtered_results
            
        except Exception as e:
            print(f"[RETRIEVER] AI filtering error: {e}, returning all results")
            return results
        
        try:
            from server.providers import get_llm
            from langchain_core.prompts import ChatPromptTemplate
            from langchain_core.output_parsers import JsonOutputParser
            
            llm = get_llm()
            if not llm:
                # Fallback: return all results if AI is unavailable
                print("[RETRIEVER] AI filtering unavailable, returning all results")
                return results
            
            # AI-driven relevance assessment prompt
            relevance_prompt = ChatPromptTemplate.from_template("""
You are an expert at assessing document relevance for search queries. Your task is to evaluate which documents are most relevant to the user's specific query and filter out any that might cause topic confusion.

**User Query**: "{query}"

**Available Documents**:
{documents_summary}

**Instructions**:
1. Understand what the user is specifically asking about
2. Identify the main topic/domain of the query
3. Assess which documents are directly relevant to this topic
4. Score each document's relevance (0.0 to 1.0)
5. Filter out documents that might confuse the analysis by mixing different topics

**Response Format** (JSON):
{{
    "query_focus": "Brief description of what the user is asking about",
    "relevance_scores": [
        {{
            "document_id": "doc1_id",
            "relevance_score": 0.0-1.0,
            "reasoning": "Why this document is/isn't relevant"
        }}
    ],
    "filtering_decision": "strict|moderate|minimal",
    "explanation": "Overall filtering strategy applied"
}}

**Filtering Guidelines**:
- Use "strict" filtering when query is very specific (single product/topic)
- Use "moderate" filtering when query could benefit from related context
- Use "minimal" filtering for broad or exploratory queries
""")
            
            # Prepare document summary for AI assessment
            documents_summary = self._prepare_documents_for_ai_assessment(results)
            
            parser = JsonOutputParser()
            chain = relevance_prompt | llm | parser
            
            # Get AI assessment
            assessment = await chain.ainvoke({
                "query": query,
                "documents_summary": documents_summary
            })
            
            # Apply AI-driven filtering
            filtered_results = self._apply_ai_filtering(results, assessment)
            
            print(f"[RETRIEVER] AI filtering: {len(results)} -> {len(filtered_results)} documents")
            print(f"[RETRIEVER] Filtering strategy: {assessment.get('filtering_decision', 'unknown')}")
            
            return filtered_results
            
        except Exception as e:
            print(f"[RETRIEVER] AI filtering error: {e}, returning all results")
            return results
    
    def _prepare_documents_for_ai_assessment(self, results: List[Dict[str, Any]]) -> str:
        """Prepare document summaries for AI relevance assessment."""
        summaries = []
        
        for i, result in enumerate(results, 1):
            doc_id = result.get("id", f"doc_{i}")
            filename = result.get("filename", f"Document {i}")
            content = result.get("content", "")
            score = result.get("score", 0.0)
            
            # Create a concise summary for AI assessment
            content_preview = content[:300] + "..." if len(content) > 300 else content
            
            summaries.append(f"""
Document {i} (ID: {doc_id}):
- Filename: {filename}
- Search Score: {score:.3f}
- Content Preview: {content_preview}
""")
        
        return "\n".join(summaries)
    
    def _prepare_simple_documents_summary(self, results: List[Dict[str, Any]]) -> str:
        """Prepare simplified document summaries for faster AI assessment."""
        summaries = []
        
        for i, result in enumerate(results, 1):
            doc_id = result.get("id", f"doc_{i}")
            filename = result.get("filename", f"Document {i}")
            content = result.get("content", "")
            score = result.get("score", 0.0)
            
            # Create a very concise summary for speed
            content_preview = content[:150] + "..." if len(content) > 150 else content
            
            summaries.append(f"ID: {doc_id}, File: {filename}, Score: {score:.2f}, Content: {content_preview}")
        
        return "\n".join(summaries)
    
    def _apply_smart_filtering(
        self, 
        results: List[Dict[str, Any]], 
        assessment: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Apply smart filtering based on AI assessment - handles complex information needs."""
        relevant_ids = set(assessment.get("relevant_document_ids", []))
        filtering_strategy = assessment.get("filtering_strategy", "keep_all")
        coverage_assessment = assessment.get("information_coverage_assessment", "single_source_sufficient")
        
        print(f"[RETRIEVER] AI Assessment - Strategy: {filtering_strategy}, Coverage: {coverage_assessment}")
        
        if filtering_strategy == "keep_all" or not relevant_ids:
            print(f"[RETRIEVER] AI recommends keeping all documents")
            return results
        
        if filtering_strategy == "comprehensive_coverage":
            # AI detected that question needs multiple information sources
            print(f"[RETRIEVER] AI detected comprehensive information need - ensuring diverse document coverage")
            
            # Keep all relevant documents for comprehensive coverage
            filtered_results = []
            for result in results:
                doc_id = result.get("id", "")
                if doc_id in relevant_ids:
                    filtered_results.append(result)
            
            # Ensure we have enough diverse sources (minimum 4-5 for comprehensive)
            min_docs_needed = 4 if len(results) >= 8 else 3
            if len(filtered_results) < min_docs_needed and len(results) >= min_docs_needed:
                print(f"[RETRIEVER] Ensuring sufficient documents for comprehensive coverage ({min_docs_needed})")
                remaining_results = [r for r in results if r.get("id", "") not in relevant_ids]
                additional_needed = min_docs_needed - len(filtered_results)
                # Add diverse additional documents (not just highest scoring)
                additional_docs = self._select_diverse_documents(remaining_results, additional_needed)
                filtered_results.extend(additional_docs)
            
            return filtered_results
        
        if filtering_strategy == "balanced_comparison":
            # For comparative queries, ensure we keep diverse content
            print(f"[RETRIEVER] AI detected comparative query - ensuring balanced document selection")
            
            filtered_results = []
            for result in results:
                doc_id = result.get("id", "")
                if doc_id in relevant_ids:
                    filtered_results.append(result)
            
            # Safety: ensure we have enough documents for comparison (minimum 3)
            if len(filtered_results) < 3 and len(results) >= 3:
                print(f"[RETRIEVER] Ensuring minimum documents for comparison")
                remaining_results = [r for r in results if r.get("id", "") not in relevant_ids]
                additional_needed = 3 - len(filtered_results)
                additional_docs = sorted(remaining_results, key=lambda x: x.get('score', 0), reverse=True)[:additional_needed]
                filtered_results.extend(additional_docs)
            
            return filtered_results
        
        if filtering_strategy == "focused_selection":
            # AI determined that specific, focused documents are sufficient
            print(f"[RETRIEVER] AI recommends focused document selection")
            filtered_results = []
            for result in results:
                doc_id = result.get("id", "")
                if doc_id in relevant_ids:
                    filtered_results.append(result)
            
            # For focused selection, limit to top relevant documents
            filtered_results = sorted(filtered_results, key=lambda x: x.get('score', 0), reverse=True)[:3]
            return filtered_results
        
        # Standard filtering for "keep_most" strategy
        filtered_results = []
        for result in results:
            doc_id = result.get("id", "")
            if doc_id in relevant_ids:
                filtered_results.append(result)
        
        # Safety: if AI filtered too aggressively, keep top results by score
        if len(filtered_results) < 2 and len(results) >= 2:
            print(f"[RETRIEVER] AI filtering too aggressive, keeping top 3 by score")
            return sorted(results, key=lambda x: x.get('score', 0), reverse=True)[:3]
        
        return filtered_results if filtered_results else results
    
    def _select_diverse_documents(self, documents: List[Dict[str, Any]], count: int) -> List[Dict[str, Any]]:
        """Select diverse documents based on content variety, not just scores."""
        if len(documents) <= count:
            return documents
        
        selected = []
        remaining = documents.copy()
        
        # Start with highest scoring document
        if remaining:
            best_doc = max(remaining, key=lambda x: x.get('score', 0))
            selected.append(best_doc)
            remaining.remove(best_doc)
        
        # Select remaining documents based on content diversity
        while len(selected) < count and remaining:
            best_diversity_doc = None
            max_diversity_score = -1
            
            for candidate in remaining:
                # Calculate diversity score based on content difference
                diversity_score = self._calculate_content_diversity(candidate, selected)
                if diversity_score > max_diversity_score:
                    max_diversity_score = diversity_score
                    best_diversity_doc = candidate
            
            if best_diversity_doc:
                selected.append(best_diversity_doc)
                remaining.remove(best_diversity_doc)
            else:
                break
        
        return selected
    
    def _calculate_content_diversity(self, candidate: Dict[str, Any], selected: List[Dict[str, Any]]) -> float:
        """Calculate how diverse a candidate document is compared to already selected ones."""
        if not selected:
            return 1.0
        
        candidate_content = candidate.get("content", "").lower()
        candidate_words = set(candidate_content.split()[:50])  # First 50 words
        
        total_overlap = 0
        for selected_doc in selected:
            selected_content = selected_doc.get("content", "").lower()
            selected_words = set(selected_content.split()[:50])
            
            overlap = len(candidate_words.intersection(selected_words))
            total_overlap += overlap
        
        # Higher diversity score = less overlap
        avg_overlap = total_overlap / len(selected)
        diversity_score = max(0, 1.0 - (avg_overlap / 50))  # Normalize to 0-1
        
        return diversity_score
    
    def _apply_ai_filtering(
        self, 
        results: List[Dict[str, Any]], 
        assessment: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Apply AI-driven filtering based on relevance assessment."""
        relevance_scores = assessment.get("relevance_scores", [])
        filtering_decision = assessment.get("filtering_decision", "moderate")
        
        # Create relevance score mapping
        relevance_map = {}
        for score_info in relevance_scores:
            doc_id = score_info.get("document_id", "")
            relevance_score = score_info.get("relevance_score", 0.5)
            relevance_map[doc_id] = relevance_score
        
        # Apply filtering based on strategy
        filtered_results = []
        
        for result in results:
            doc_id = result.get("id", "")
            original_score = result.get("score", 0.0)
            relevance_score = relevance_map.get(doc_id, 0.5)  # Default to neutral
            
            # Determine inclusion based on filtering strategy
            should_include = False
            
            if filtering_decision == "strict":
                should_include = relevance_score >= 0.7
            elif filtering_decision == "moderate":
                should_include = relevance_score >= 0.4
            else:  # minimal
                should_include = relevance_score >= 0.2
            
            if should_include:
                # Combine original search score with AI relevance assessment
                combined_score = (original_score * 0.7) + (relevance_score * 0.3)
                result["ai_relevance_score"] = relevance_score
                result["combined_score"] = combined_score
                filtered_results.append(result)
        
        # Sort by combined score
        filtered_results.sort(key=lambda x: x.get("combined_score", 0), reverse=True)
        
        # Ensure we don't filter out everything
        if not filtered_results and results:
            print("[RETRIEVER] AI filtering too aggressive, keeping top result")
            top_result = max(results, key=lambda x: x.get("score", 0))
            top_result["ai_relevance_score"] = 0.5
            top_result["combined_score"] = top_result.get("score", 0)
            filtered_results = [top_result]
        
        return filtered_results
    
    def _select_diverse_queries(self, original_query: str, refined_queries: List[str], max_select: int = 2) -> List[str]:
        """Select most diverse and relevant refined queries to avoid redundant searches."""
        if not refined_queries:
            return []
        
        if len(refined_queries) <= max_select:
            return refined_queries
        
        # Simple diversity selection based on word overlap
        selected = []
        original_words = set(original_query.lower().split())
        
        # Score queries by diversity (fewer overlapping words = more diverse)
        scored_queries = []
        for query in refined_queries:
            query_words = set(query.lower().split())
            overlap = len(original_words.intersection(query_words))
            diversity_score = len(query_words) - overlap  # Higher score = more diverse
            scored_queries.append((diversity_score, query))
        
        # Sort by diversity and take top queries
        scored_queries.sort(key=lambda x: x[0], reverse=True)
        selected = [query for _, query in scored_queries[:max_select]]
        
        print(f"[RETRIEVER] Selected {len(selected)} diverse queries from {len(refined_queries)} options")
        return selected
    
    async def _apply_lightweight_filtering(
        self, 
        results: List[Dict[str, Any]], 
        query: str,
        target_count: int
    ) -> List[Dict[str, Any]]:
        """Apply lightweight filtering to reduce result set without heavy AI processing."""
        if not results or len(results) <= target_count:
            return results
        
        # Simple score-based filtering - keep results above average score
        scores = [r.get('score', 0) for r in results]
        avg_score = sum(scores) / len(scores)
        score_threshold = avg_score * 0.9  # Keep results within 10% of average
        
        filtered = [r for r in results if r.get('score', 0) >= score_threshold]
        
        # If still too many, take top by score
        if len(filtered) > target_count:
            filtered = sorted(filtered, key=lambda x: x.get('score', 0), reverse=True)[:target_count]
        
        print(f"[RETRIEVER] Lightweight filtering: score threshold {score_threshold:.3f}, kept {len(filtered)}/{len(results)}")
        return filtered

    def _deduplicate_content(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Remove chunks with very similar content to avoid showing duplicates."""
        if not results:
            return results
        
        deduplicated = []
        seen_content = set()
        
        for result in results:
            content = result.get("content", "").strip()
            
            # Create a simplified version for comparison (first 100 chars)
            content_key = content[:100].lower().replace(" ", "").replace("\n", "")
            
            # Check if we've seen very similar content
            is_duplicate = False
            for seen_key in seen_content:
                # If 80% of the content key matches, consider it a duplicate
                if len(content_key) > 20 and len(seen_key) > 20:
                    # Simple similarity check
                    shorter_len = min(len(content_key), len(seen_key))
                    matches = sum(1 for i in range(shorter_len) if content_key[i] == seen_key[i])
                    similarity = matches / shorter_len
                    
                    if similarity > 0.8:  # 80% similarity threshold
                        is_duplicate = True
                        break
            
            if not is_duplicate:
                seen_content.add(content_key)
                deduplicated.append(result)
                print(f"[RETRIEVER] Added unique content - ID: {result.get('id', 'unknown')[:8]}...")
            else:
                print(f"[RETRIEVER] Skipped duplicate content - ID: {result.get('id', 'unknown')[:8]}...")
        
        print(f"[RETRIEVER] Deduplication: {len(results)} -> {len(deduplicated)} chunks")
        return deduplicated
        """Remove chunks with very similar content to avoid showing duplicates."""
        if not results:
            return results
        
        deduplicated = []
        seen_content = set()
        
        for result in results:
            content = result.get("content", "").strip()
            
            # Create a simplified version for comparison (first 100 chars)
            content_key = content[:100].lower().replace(" ", "").replace("\n", "")
            
            # Check if we've seen very similar content
            is_duplicate = False
            for seen_key in seen_content:
                # If 80% of the content key matches, consider it a duplicate
                if len(content_key) > 20 and len(seen_key) > 20:
                    # Simple similarity check
                    shorter_len = min(len(content_key), len(seen_key))
                    matches = sum(1 for i in range(shorter_len) if content_key[i] == seen_key[i])
                    similarity = matches / shorter_len
                    
                    if similarity > 0.8:  # 80% similarity threshold
                        is_duplicate = True
                        break
            
            if not is_duplicate:
                seen_content.add(content_key)
                deduplicated.append(result)
                print(f"[RETRIEVER] Added unique content - ID: {result.get('id', 'unknown')[:8]}...")
            else:
                print(f"[RETRIEVER] Skipped duplicate content - ID: {result.get('id', 'unknown')[:8]}...")
        
        print(f"[RETRIEVER] Deduplication: {len(results)} -> {len(deduplicated)} chunks")
        return deduplicated

    async def _rerank_results(
        self, 
        results: List[Dict[str, Any]], 
        classification: QueryClassification
    ) -> List[Dict[str, Any]]:
        """AI-driven re-ranking based on classification and content analysis."""
        if not results:
            return results
        
        try:
            from server.providers import get_llm
            from langchain_core.prompts import ChatPromptTemplate
            from langchain_core.output_parsers import JsonOutputParser
            
            llm = get_llm()
            if not llm:
                print("[RETRIEVER] AI re-ranking unavailable, using score-based sorting")
                return sorted(results, key=lambda x: x.get("score", 0), reverse=True)
            
            # AI-driven re-ranking prompt
            rerank_prompt = ChatPromptTemplate.from_template("""
You are an expert at ranking documents based on their relevance to specific query types and user intent.

**Query Classification**: {classification_type}
**Classification Details**: {classification_info}

**Documents to Rank**:
{documents_summary}

**Instructions**:
Re-rank these documents based on their relevance to the query type:

- **FACTUAL**: Prioritize comprehensive, authoritative, well-structured content
- **TEMPORAL**: Prioritize documents with timeline info, dates, evolution indicators  
- **COUNTERFACTUAL**: Prioritize documents with numerical data, scenarios, calculations

**Response Format** (JSON):
{{
    "ranking_strategy": "Description of the ranking approach used",
    "ranked_documents": [
        {{
            "document_id": "doc_id",
            "final_rank": 1-N,
            "relevance_score": 0.0-1.0,
            "ranking_reasoning": "Why this document received this rank"
        }}
    ]
}}

Rank from 1 (most relevant) to N (least relevant).
""")
            
            documents_summary = self._prepare_documents_for_ai_assessment(results)
            classification_info = {
                "type": classification["type"],
                "confidence": classification["confidence"], 
                "reasoning": classification["reasoning"],
                "keywords": classification["keywords"],
                "temporal_indicators": classification.get("temporal_indicators", [])
            }
            
            parser = JsonOutputParser()
            chain = rerank_prompt | llm | parser
            
            ranking_result = await chain.ainvoke({
                "classification_type": classification["type"],
                "classification_info": str(classification_info),
                "documents_summary": documents_summary
            })
            
            # Apply AI ranking
            reranked_results = self._apply_ai_ranking(results, ranking_result)
            
            print(f"[RETRIEVER] AI re-ranking applied for {classification['type']} query")
            
            return reranked_results
            
        except Exception as e:
            print(f"[RETRIEVER] AI re-ranking error: {e}, using basic score sorting")
            return sorted(results, key=lambda x: x.get("score", 0), reverse=True)
    
    def _apply_ai_ranking(
        self, 
        results: List[Dict[str, Any]], 
        ranking: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Apply AI-generated ranking to results."""
        ranked_docs = ranking.get("ranked_documents", [])
        
        # Create ranking mapping
        rank_map = {}
        for rank_info in ranked_docs:
            doc_id = rank_info.get("document_id", "")
            final_rank = rank_info.get("final_rank", 999)
            relevance_score = rank_info.get("relevance_score", 0.5)
            rank_map[doc_id] = {"rank": final_rank, "relevance": relevance_score}
        
        # Apply ranking to results
        for result in results:
            doc_id = result.get("id", "")
            rank_info = rank_map.get(doc_id, {"rank": 999, "relevance": 0.5})
            
            result["ai_rank"] = rank_info["rank"]
            result["ai_relevance"] = rank_info["relevance"]
            
            # Calculate final score combining original score and AI assessment
            original_score = result.get("score", 0.0)
            ai_relevance = rank_info["relevance"]
            final_score = (original_score * 0.4) + (ai_relevance * 0.6)
            result["final_score"] = final_score
        
        # Sort by AI rank (lower rank number = higher priority)
        results.sort(key=lambda x: (x.get("ai_rank", 999), -x.get("final_score", 0)))
        
        return results
    
    async def retrieve_documents(
        self,
        query: str,
        classification: QueryClassification,
        max_chunks: int = 5,
        enable_tracing: bool = True,
        refined_queries: Optional[List[str]] = None
    ) -> tuple[List[DocumentChunk], Dict[str, Any]]:
        """
        Retrieve relevant document chunks with classification-aware enhancements.
        
        Args:
            query: User's question
            classification: Query classification from Router Agent
            max_chunks: Maximum number of chunks to return
            enable_tracing: Whether to track execution metadata
            refined_queries: Additional refined questions to search with
            
        Returns:
            Tuple of (retrieved chunks, retrieval metadata)
        """
        start_time = datetime.now() if enable_tracing else None
        use_general_knowledge = self._get_use_general_knowledge()
        
        try:
            # Enhance query based on classification
            enhanced_query = self._enhance_query_for_type(query, classification)
            
            # OPTIMIZATION: Smart query selection instead of searching all
            search_queries = [enhanced_query]
            if refined_queries:
                # Select top 2-3 most diverse refined queries instead of all 5
                selected_refined = self._select_diverse_queries(enhanced_query, refined_queries, max_select=2)
                search_queries.extend(selected_refined)
                print(f"[RETRIEVER] Optimized search: original + {len(selected_refined)}/{len(refined_queries)} refined queries")
            
            # OPTIMIZATION: Batch search with higher k, then deduplicate
            all_results = []
            batch_k = max_chunks * 2  # Get more results per query for better diversity
            
            for i, search_query in enumerate(search_queries):
                query_results = await self.azure_client.semantic_search(
                    query=search_query,
                    top_k=batch_k
                )
                
                # Tag results with source query for debugging
                for result in query_results:
                    result['source_query'] = 'original' if i == 0 else f'refined_{i}'
                    result['source_query_text'] = search_query
                
                all_results.extend(query_results)
                print(f"[RETRIEVER] Query {i+1}: {len(query_results)} results")
            
            # OPTIMIZATION: Fast deduplication first, then process smaller set
            seen_chunks = set()
            unique_results = []
            for result in all_results:
                chunk_id = result.get('id', result.get('chunkId', ''))
                if chunk_id not in seen_chunks:
                    seen_chunks.add(chunk_id)
                    unique_results.append(result)
            
            # Take top results after deduplication - increased limit for better filtering
            raw_results = sorted(unique_results, key=lambda x: x.get('score', 0), reverse=True)[:max_chunks * 3]
            
            print(f"[RETRIEVER] Optimized results: {len(all_results)} -> {len(unique_results)} unique -> {len(raw_results)} top")
            if raw_results:
                print(f"[RETRIEVER] Top scores: {[r.get('score', 0) for r in raw_results[:3]]}")
            
            # Check if no documents found and general knowledge is enabled
            no_docs_found = not raw_results
            if no_docs_found and use_general_knowledge:
                print(f"[RETRIEVER] No documents found, useGeneralKnowledge=True - suggesting general knowledge fallback")
                return [], {
                    "total_found": 0,
                    "enhanced_query": enhanced_query,
                    "classification_type": classification["type"],
                    "should_use_general_knowledge": True,
                    "fallback_reason": "No relevant documents found with sufficient score threshold"
                }
            elif no_docs_found:
                print(f"[RETRIEVER] No documents found, useGeneralKnowledge=False - no fallback available")
                return [], {
                    "total_found": 0,
                    "enhanced_query": enhanced_query,
                    "classification_type": classification["type"],
                    "should_use_general_knowledge": False,
                    "fallback_reason": "No relevant documents found and general knowledge disabled"
                }
            
            # OPTIMIZATION: Intelligent filtering pipeline - use AI only when needed
            # Apply basic relevance filtering only if we have many results
            if len(raw_results) > max_chunks * 2:
                # Use lightweight filtering for performance, but fall back to AI if results are poor
                filtered_results = await self._apply_lightweight_filtering(raw_results, query, max_chunks * 2)
                
                # If lightweight filtering removes too many good results, use AI filtering
                if len(filtered_results) < max_chunks and len(raw_results) >= max_chunks:
                    print(f"[RETRIEVER] Lightweight filtering too aggressive, using AI filtering")
                    filtered_results = await self._filter_relevant_results(raw_results, query, classification)
                else:
                    print(f"[RETRIEVER] Lightweight filtering: {len(raw_results)} -> {len(filtered_results)} chunks")
            else:
                filtered_results = raw_results
                print(f"[RETRIEVER] Skipped filtering - result count acceptable: {len(raw_results)}")
            
            # OPTIMIZATION: Unified smart AI re-ranking - use AI when scores are ambiguous for ALL query types
            if len(filtered_results) >= 3:
                # Check if top results have similar scores (ambiguous ranking)
                top_scores = [r.get('score', 0) for r in filtered_results[:3]]
                score_variance = max(top_scores) - min(top_scores)
                
                if score_variance < 0.1:  # Scores are very close, use AI re-ranking
                    print(f"[RETRIEVER] Close scores detected (variance: {score_variance:.3f}), using AI re-ranking for {classification['type']} query")
                    reranked_results = await self._rerank_results(filtered_results, classification)
                else:
                    reranked_results = filtered_results
                    print(f"[RETRIEVER] Clear score differences (variance: {score_variance:.3f}), skipped AI re-ranking for {classification['type']} query")
            elif len(filtered_results) >= 2:
                # With only 2 results, check if they're very close
                top_scores = [r.get('score', 0) for r in filtered_results[:2]]
                score_variance = max(top_scores) - min(top_scores)
                
                if score_variance < 0.05:  # Even closer threshold for 2 results
                    print(f"[RETRIEVER] Very close scores with 2 results (variance: {score_variance:.3f}), using AI re-ranking for {classification['type']} query")
                    reranked_results = await self._rerank_results(filtered_results, classification)
                else:
                    reranked_results = filtered_results
                    print(f"[RETRIEVER] Clear winner with 2 results (variance: {score_variance:.3f}), skipped AI re-ranking for {classification['type']} query")
            else:
                # Single result or empty - no need for re-ranking
                reranked_results = filtered_results
                print(f"[RETRIEVER] Single/no results, skipped AI re-ranking for {classification['type']} query")
            
            # Basic deduplication only
            deduplicated_results = self._deduplicate_content(reranked_results)
            
            # Take top k results
            final_results = deduplicated_results[:max_chunks]
            
            print(f"[RETRIEVER] Final results count: {len(final_results)}")
            if final_results:
                print(f"[RETRIEVER] Final scores: {[r.get('score', 0) for r in final_results[:3]]}")
            
            # Convert to DocumentChunk format
            document_chunks = []
            for result in final_results:
                chunk = DocumentChunk(
                    id=result["id"],
                    content=result["content"],
                    documentId=result["documentId"],
                    filename=result["filename"],
                    chunkIndex=result["chunkIndex"],
                    score=result["score"],
                    metadata=result.get("metadata", {})
                )
                document_chunks.append(chunk)
            
            # Prepare retrieval metadata
            metadata = {
                "total_found": len(raw_results),
                "after_filtering": len(filtered_results),
                "final_returned": len(document_chunks),
                "enhanced_query": enhanced_query,
                "classification_type": classification["type"],
                "reranking_applied": classification["type"] != "factual",
                "average_score": sum(c["score"] for c in document_chunks) / len(document_chunks) if document_chunks else 0,
                "should_use_general_knowledge": False,  # Documents were found
                "use_general_knowledge_enabled": use_general_knowledge,
                "optimization_applied": True,
                "queries_searched": len(search_queries)
            }
            
            return document_chunks, metadata
            
        except Exception as e:
            print(f"Retriever Agent error: {e}")
            return [], {
                "error": str(e),
                "enhanced_query": query,
                "classification_type": classification["type"],
                "should_use_general_knowledge": use_general_knowledge,
                "fallback_reason": f"Retrieval error: {str(e)}"
            }
    
    def create_trace(
        self,
        query: str,
        classification: QueryClassification,
        chunks: List[DocumentChunk],
        metadata: Dict[str, Any],
        start_time: datetime,
        error: str = None
    ) -> AgentTrace:
        """Create execution trace for this agent."""
        end_time = datetime.now()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)
        
        output_data = {
            "chunks_count": len(chunks),
            "metadata": metadata
        } if not error else None
        
        return AgentTrace(
            agent_name="retriever",
            start_time=start_time,
            end_time=end_time,
            input_data={
                "query": query,
                "classification": classification,
                "max_chunks": metadata.get("final_returned", 0)
            },
            output_data=output_data,
            error=error,
            duration_ms=duration_ms
        )

# Global retriever agent instance
retriever_agent = RetrieverAgent()