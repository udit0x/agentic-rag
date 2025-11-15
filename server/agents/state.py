"""LangGraph state schema for multi-agent orchestration."""
from typing import TypedDict, List, Dict, Any, Optional, Union
from langchain_core.messages import BaseMessage
from datetime import datetime

class DocumentChunk(TypedDict):
    """Represents a retrieved document chunk."""
    id: str
    content: str
    documentId: str
    filename: str
    chunkIndex: int
    score: float
    metadata: Optional[Dict[str, Any]]

class IntentClassification(TypedDict):
    """Intent classification result from Intent Router Agent."""
    route_type: str  # "CHAT", "RAG", "HYBRID"
    confidence: float
    reasoning: str
    conversation_references: List[str]
    needs_retrieval: bool
    reuse_cached_docs: bool
    reuse_refined_queries: bool

class QueryClassification(TypedDict):
    """Query classification result from Router Agent."""
    type: str  # "factual", "counterfactual", "temporal"
    confidence: float
    reasoning: str
    keywords: List[str]
    temporal_indicators: Optional[List[str]]
    use_general_knowledge: Optional[bool]

class SimulationParameters(TypedDict):
    """Parameters extracted for simulation mode."""
    base_value: Optional[float]
    change_percentage: Optional[float]
    change_amount: Optional[float]
    scenario_description: str
    variables: Dict[str, Any]

class SimulationResult(TypedDict):
    """Result from Simulation Agent."""
    current_value: float
    projected_value: float
    change_amount: float
    change_percentage: float
    assumptions: List[str]
    methodology: str

class TemporalAnalysis(TypedDict):
    """Result from Temporal Agent."""
    timeline: List[Dict[str, Any]]
    conflicts: List[Dict[str, Any]]
    outdated_information: List[str]
    most_recent_date: Optional[datetime]
    confidence_score: float
    analysis_focus: Optional[str]
    evolution_summary: Optional[str]
    current_state: Optional[str]
    recommendations: Optional[str]
    relevant_documents: Optional[List[str]]
    excluded_documents: Optional[List[str]]
    data_quality_note: Optional[str]

class DocumentSummaryResult(TypedDict):
    """Result from Document Summary Agent."""
    summary_type: str  # "single" or "multi"
    document_count: int
    summaries: List[Dict[str, Any]]  # Individual document summaries
    common_themes: Optional[List[str]]  # For multi-doc
    comparative_analysis: Optional[str]  # For multi-doc
    synthesis: Optional[str]  # For multi-doc
    confidence_score: float

class AgentTrace(TypedDict):
    """Individual agent execution trace."""
    agent_name: str
    start_time: datetime
    end_time: Optional[datetime]
    input_data: Dict[str, Any]
    output_data: Optional[Dict[str, Any]]
    error: Optional[str]
    duration_ms: Optional[int]

class AgentState(TypedDict):
    """Shared state for multi-agent LangGraph orchestration."""
    
    # Input
    query: str
    session_id: Optional[str]
    user_id: Optional[str]
    document_ids: Optional[List[str]]  # Document filtering support
    
    # Intent Router Agent outputs
    intent_classification: Optional[IntentClassification]
    
    # Router Agent outputs
    classification: Optional[QueryClassification]
    
    # Query Refinement Agent outputs  
    query_refinement: Optional[Dict[str, Any]]
    
    # Retriever Agent outputs
    retrieved_chunks: List[DocumentChunk]
    retrieval_metadata: Optional[Dict[str, Any]]
    
    # Conversation Memory Agent outputs
    conversation_context: Optional[str]
    memory_response: Optional[str]
    
    # Reasoning Agent outputs
    reasoning_response: Optional[str]
    
    # Simulation Agent outputs
    simulation_parameters: Optional[SimulationParameters]
    simulation_result: Optional[SimulationResult]
    
    # Temporal Agent outputs
    temporal_analysis: Optional[TemporalAnalysis]
    
    # Document Summary Agent outputs
    summary_response: Optional[DocumentSummaryResult]
    
    # Final outputs
    final_response: str
    response_type: str  # "reasoning", "simulation", "temporal", "chat", "hybrid", "summary"
    sources: List[DocumentChunk]
    
    # Cost tracking and optimization
    cost_summary: Optional[Dict[str, Any]]
    
    # Execution metadata
    agent_traces: List[AgentTrace]
    total_execution_time: Optional[int]
    error_message: Optional[str]
    error_type: Optional[str]
    
    # Debugging and observability
    debug_info: Optional[Dict[str, Any]]
    intermediate_steps: List[Dict[str, Any]]

class WorkflowConfig(TypedDict):
    """Configuration for the agent workflow."""
    enable_tracing: bool
    max_chunks: int
    temperature: float
    parallel_execution: bool
    timeout_seconds: int
    debug_mode: bool

# Default configuration with Level 1 precision tuning
DEFAULT_CONFIG: WorkflowConfig = {
    "enable_tracing": True,
    "max_chunks": 3,  # Level 1: Reduced from 5 to 3 for higher precision
    "temperature": 0.7,
    "parallel_execution": True,
    "timeout_seconds": 30,
    "debug_mode": False,
}