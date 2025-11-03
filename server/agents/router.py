"""Router Agent for query classification."""
import re
from typing import Dict, Any, List
from datetime import datetime
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser, StrOutputParser, BaseOutputParser
from pydantic import BaseModel, Field
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from server.providers import get_llm
from server.agents.state import QueryClassification, AgentTrace
from server.config_manager import config_manager

class CleanJsonOutputParser(BaseOutputParser[dict]):
    """Custom JSON parser that handles markdown code blocks."""
    
    def parse(self, text: str) -> dict:
        """Parse JSON from text, handling markdown code blocks."""
        # Remove markdown code blocks if present
        text = text.strip()
        if text.startswith('```json'):
            text = text[7:]  # Remove '```json'
        if text.startswith('```'):
            text = text[3:]  # Remove '```'
        if text.endswith('```'):
            text = text[:-3]  # Remove closing '```'
        
        text = text.strip()
        
        # Fix Python boolean values to JSON boolean values
        text = text.replace(': True', ': true').replace(': False', ': false')
        
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            print(f"[ROUTER_AGENT] JSON parsing error: {e}")
            print(f"[ROUTER_AGENT] Raw text: {repr(text)}")
            raise e
    
    @property
    def _type(self) -> str:
        return "clean_json"

class ClassificationOutput(BaseModel):
    """Pydantic model for structured classification output."""
    type: str = Field(description="Query type: factual, counterfactual, or temporal")
    confidence: float = Field(description="Confidence score between 0 and 1")
    reasoning: str = Field(description="Brief explanation of classification")
    keywords: List[str] = Field(description="Key terms that influenced classification")
    temporal_indicators: List[str] = Field(default=[], description="Time-related terms found")
    use_general_knowledge: bool = Field(default=False, description="Whether general knowledge should be used")

# Classification prompt template
CLASSIFICATION_PROMPT = """You are an expert query classifier for a RAG system. Analyze the user's query and classify it into one of three primary types:

**FACTUAL**: Standard information retrieval
- Examples: "What is Azure OpenAI?", "How does RAG work?", "List the features of..."
- Characteristics: Seeking existing facts, definitions, procedures
- DEFAULT: Most queries should be classified as factual to attempt document retrieval first

**COUNTERFACTUAL**: "What-if" scenarios and simulations
- Examples: "What if revenue increased by 15%?", "Suppose we hired 10 more developers", "Imagine if the budget was doubled"
- Characteristics: Hypothetical scenarios, alternative outcomes, projections
- Keywords: "what if", "suppose", "imagine", "if we", "assuming", "hypothetically"

**TEMPORAL**: Questions about changes over time or conflicting information
- Examples: "Has the policy changed since 2023?", "What's the latest version?", "Show me how requirements evolved"
- Characteristics: Time-sensitive queries, version comparisons, historical analysis
- Keywords: "latest", "recent", "changed", "updated", "since", "before", "after", "current", "now"

Query: "{query}"

Configuration: useGeneralKnowledge = {use_general_knowledge}

IMPORTANT: Always prefer "factual" classification to allow document retrieval first. 
The system will handle fallback to general knowledge if no relevant documents are found.

Analyze this query carefully:
1. Look for explicit keywords that indicate counterfactual or temporal type
2. Consider the intent behind the question
3. Check for temporal references or hypothetical language
4. Default to "factual" unless clearly counterfactual or temporal

Return your analysis as JSON with the following structure:
{{
    "type": "factual|counterfactual|temporal",
    "confidence": 0.0-1.0,
    "reasoning": "brief explanation",
    "keywords": ["key", "terms", "found"],
    "temporal_indicators": ["time", "related", "terms"],
    "use_general_knowledge": {use_general_knowledge}
}}"""

class RouterAgent:
    """Agent responsible for classifying user queries."""
    
    def __init__(self):
        # Get LLM dynamically from provider
        self.llm = None
        self.prompt = ChatPromptTemplate.from_template(CLASSIFICATION_PROMPT)
        self.parser = CleanJsonOutputParser()
        self.classification_chain = None
    
    def _get_llm(self):
        """Get the current LLM instance."""
        if self.llm is None:
            try:
                print(f"[ROUTER_AGENT] Initializing LLM...")
                self.llm = get_llm()
                print(f"[ROUTER_AGENT] LLM initialized successfully: {type(self.llm).__name__}")
                # Rebuild chain when LLM is available
                self._build_chain()
            except Exception as e:
                print(f"[ROUTER_AGENT] Error getting LLM: {e}")
                return None
        return self.llm
    
    def _build_chain(self):
        """Build the classification chain with current LLM."""
        if self.llm:
            self.classification_chain = (
                self.prompt 
                | self.llm 
                | self.parser
            )
    
    def _get_use_general_knowledge(self) -> bool:
        """Get the current useGeneralKnowledge setting from config."""
        try:
            config = config_manager.get_current_config()
            return config.useGeneralKnowledge if config else True
        except Exception as e:
            print(f"[ROUTER_AGENT] Error getting useGeneralKnowledge config: {e}")
            return True  # Default to True
    
    def _extract_temporal_indicators(self, query: str) -> List[str]:
        """Extract temporal keywords from query using regex."""
        temporal_patterns = [
            r'\b(latest|recent|current|now|today|newest|up-to-date)\b',
            r'\b(since|before|after|until|from)\s+\d{4}\b',
            r'\b(changed|updated|modified|evolved|revised|replaced)\b',
            r'\b(version|revision|edition|update|change|difference)\b',
            r'\b(was|were|used to be|previously|formerly|originally)\b',
            r'\b(\d{4}|\d{1,2}/\d{1,2}/\d{4}|Q[1-4]\s+\d{4})\b',  # dates and quarters
            r'\b(outdated|old|obsolete|deprecated|legacy)\b',
            r'\b(timeline|history|evolution|progression)\b',
            r'\b(conflict|contradiction|discrepancy|mismatch)\b',
            r'\b(has.*changed|did.*change|when.*change)\b',
        ]
        
        indicators = []
        for pattern in temporal_patterns:
            matches = re.findall(pattern, query.lower())
            indicators.extend(matches)
        
        return list(set(indicators))
    
    def _extract_counterfactual_indicators(self, query: str) -> List[str]:
        """Extract counterfactual keywords from query."""
        cf_patterns = [
            r'\bwhat if\b',
            r'\bsuppose\b',
            r'\bimagine\b',
            r'\bif we\b',
            r'\bassuming\b',
            r'\bhypothetically\b',
            r'\bwould.*if\b',
            r'\bcould.*if\b',
            r'\bscenario where\b',
            r'\bincrease.*by\s+\d+%\b',
            r'\bdecrease.*by\s+\d+%\b',
        ]
        
        indicators = []
        for pattern in cf_patterns:
            if re.search(pattern, query.lower()):
                match = re.search(pattern, query.lower())
                if match:
                    indicators.append(match.group())
        
        return indicators
    
    def _fallback_classification(self, query: str) -> QueryClassification:
        """Fallback classification when LLM is unavailable."""
        query_lower = query.lower()
        use_general_knowledge = self._get_use_general_knowledge()
        
        # Check for counterfactual indicators
        cf_indicators = self._extract_counterfactual_indicators(query)
        temporal_indicators = self._extract_temporal_indicators(query)
        
        if cf_indicators:
            return QueryClassification(
                type="counterfactual",
                confidence=0.8,
                reasoning="Detected counterfactual keywords",
                keywords=cf_indicators,
                temporal_indicators=[],
                use_general_knowledge=use_general_knowledge
            )
        elif temporal_indicators:
            return QueryClassification(
                type="temporal",
                confidence=0.7,
                reasoning="Detected temporal keywords",
                keywords=temporal_indicators,
                temporal_indicators=temporal_indicators,
                use_general_knowledge=use_general_knowledge
            )
        else:
            # Always default to factual to try document retrieval first
            return QueryClassification(
                type="factual",
                confidence=0.6,
                reasoning="Default classification - will try document retrieval first",
                keywords=[],
                temporal_indicators=[],
                use_general_knowledge=use_general_knowledge
            )
    
    def _is_general_knowledge_query(self, query: str) -> bool:
        """Determine if a query is suitable for general knowledge response."""
        query_lower = query.lower()
        
        # General knowledge indicators
        general_patterns = [
            r'\bwhat is\b',
            r'\bwhat are\b',
            r'\bhow does\b',
            r'\bhow do\b',
            r'\bexplain\b',
            r'\bdefine\b',
            r'\btell me about\b',
            r'\bdescribe\b',
            r'\bwhy do\b',
            r'\bwhy does\b',
            r'\bwhen was\b',
            r'\bwho is\b',
            r'\bwho was\b',
            r'\bwhere is\b',
            r'\bwhere are\b'
        ]
        
        # Check if query matches general knowledge patterns
        for pattern in general_patterns:
            if re.search(pattern, query_lower):
                return True
        
        # Check for common general knowledge topics
        general_topics = [
            'machine learning', 'artificial intelligence', 'blockchain', 'photography',
            'photosynthesis', 'democracy', 'capitalism', 'socialism', 'physics',
            'chemistry', 'biology', 'mathematics', 'history', 'geography',
            'programming', 'computer science', 'software engineering', 'cloud computing'
        ]
        
        for topic in general_topics:
            if topic in query_lower:
                return True
        
        return False
    
    def _extract_general_knowledge_indicators(self, query: str) -> List[str]:
        """Extract keywords that indicate general knowledge queries."""
        indicators = []
        query_lower = query.lower()
        
        # Common general knowledge question starters
        starters = ['what is', 'what are', 'how does', 'explain', 'define', 'describe']
        for starter in starters:
            if starter in query_lower:
                indicators.append(starter)
        
        return indicators
    
    async def classify_query(
        self, 
        query: str,
        enable_tracing: bool = True
    ) -> QueryClassification:
        """
        Classify a user query into factual, counterfactual, temporal, or general.
        
        Args:
            query: User's question
            enable_tracing: Whether to track execution time
            
        Returns:
            QueryClassification with type, confidence, and metadata
        """
        start_time = datetime.now() if enable_tracing else None
        use_general_knowledge = self._get_use_general_knowledge()
        
        try:
            # Ensure LLM is available
            llm = self._get_llm()
            if not llm or not self.classification_chain:
                print(f"[ROUTER_AGENT] LLM not available, using fallback. LLM: {llm is not None}, Chain: {self.classification_chain is not None}")
                # Fallback to rule-based classification
                return self._fallback_classification(query)
            
            print(f"[ROUTER_AGENT] Classifying query with LLM: {query[:50]}...")
            # Use LLM for classification
            result = await self.classification_chain.ainvoke({
                "query": query,
                "use_general_knowledge": use_general_knowledge
            })
            print(f"[ROUTER_AGENT] LLM classification result: {result}")
            
            # Ensure use_general_knowledge is set correctly
            result["use_general_knowledge"] = use_general_knowledge
            
            # Enhance with rule-based detection
            if result["type"] != "temporal":
                temporal_indicators = self._extract_temporal_indicators(query)
                if temporal_indicators and result["confidence"] < 0.8:
                    result["type"] = "temporal"
                    result["temporal_indicators"] = temporal_indicators
                    result["confidence"] = min(result["confidence"] + 0.2, 0.95)
                    result["reasoning"] += f" + detected temporal indicators: {temporal_indicators}"
            
            # Note: We've removed the automatic classification to "general" here
            # The system should always try to retrieve documents first (factual)
            # Only fallback to general knowledge after retrieval if no documents found
            
            return QueryClassification(**result)
            
        except Exception as e:
            print(f"[ROUTER_AGENT] Classification error: {e}")
            print(f"[ROUTER_AGENT] Query: {query}")
            print(f"[ROUTER_AGENT] Falling back to rule-based classification")
            # Fallback to rule-based classification
            return self._fallback_classification(query)
    
    def create_trace(
        self, 
        query: str, 
        classification: QueryClassification,
        start_time: datetime,
        error: str = None
    ) -> AgentTrace:
        """Create execution trace for this agent."""
        end_time = datetime.now()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)
        
        return AgentTrace(
            agent_name="router",
            start_time=start_time,
            end_time=end_time,
            input_data={"query": query},
            output_data=classification if not error else None,
            error=error,
            duration_ms=duration_ms
        )

# Global router agent instance
router_agent = RouterAgent()