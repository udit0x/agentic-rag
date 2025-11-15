"""Cost Tracking and Optimization Service for monitoring AI usage and savings."""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass, field
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from server.storage import storage


@dataclass
class CostEntry:
    """Individual cost tracking entry."""
    timestamp: datetime
    session_id: Optional[str]
    agent_name: str
    operation: str  # "llm_call", "vector_search", "cache_hit", "fallback"
    cost_type: str  # "api_call", "compute", "storage", "saved"
    estimated_cost: float  # In USD or relative units
    tokens_used: Optional[int] = None
    processing_time_ms: Optional[int] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class CostTracker:
    """Service for tracking AI usage costs and optimization savings."""
    
    def __init__(self):
        self.cost_entries: List[CostEntry] = []
        self.session_costs: Dict[str, List[CostEntry]] = {}  # session_id -> costs
        
        # Cost estimates (configurable)
        self.cost_estimates = {
            "llm_call_gpt4": 0.03,      # Per 1k tokens
            "llm_call_gpt35": 0.002,    # Per 1k tokens  
            "vector_search": 0.001,     # Per search
            "cache_hit": 0.0001,        # Minimal cost
            "fallback": 0.0,            # No external cost
        }
        
        # Optimization tracking
        self.optimization_stats = {
            "total_llm_calls_saved": 0,
            "total_vector_searches_saved": 0,
            "total_cost_saved": 0.0,
            "cache_hit_rate": 0.0,
            "optimization_percentage": 0.0
        }
    
    def track_cost(
        self,
        agent_name: str,
        operation: str,
        cost_type: str,
        estimated_cost: float,
        session_id: Optional[str] = None,
        tokens_used: Optional[int] = None,
        processing_time_ms: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Track a cost entry."""
        entry = CostEntry(
            timestamp=datetime.now(),
            session_id=session_id,
            agent_name=agent_name,
            operation=operation,
            cost_type=cost_type,
            estimated_cost=estimated_cost,
            tokens_used=tokens_used,
            processing_time_ms=processing_time_ms,
            metadata=metadata or {}
        )
        
        self.cost_entries.append(entry)
        
        # Track by session
        if session_id:
            if session_id not in self.session_costs:
                self.session_costs[session_id] = []
            self.session_costs[session_id].append(entry)
        
        # Update optimization stats
        if cost_type == "saved":
            self.optimization_stats["total_cost_saved"] += estimated_cost
            if operation == "llm_call":
                self.optimization_stats["total_llm_calls_saved"] += 1
            elif operation == "vector_search":
                self.optimization_stats["total_vector_searches_saved"] += 1
    
    def track_query_refinement_cost(
        self,
        session_id: Optional[str],
        refinement_result: Dict[str, Any]
    ) -> None:
        """Track costs from query refinement agent."""
        cost_savings = refinement_result.get("cost_savings", {})
        
        if cost_savings.get("cache_hit"):
            # Cache hit - minimal cost
            self.track_cost(
                agent_name="query_refinement",
                operation="cache_hit",
                cost_type="saved",
                estimated_cost=self.cost_estimates["llm_call_gpt4"] * 200,  # Estimate 200 tokens saved
                session_id=session_id,
                processing_time_ms=cost_savings.get("processing_time_ms"),
                metadata={
                    "cache_reuse_count": cost_savings.get("cache_reuse_count", 0),
                    "similarity": refinement_result.get("cache_similarity", 0.0)
                }
            )
        elif cost_savings.get("used_fallback"):
            # Fallback used - no external cost
            self.track_cost(
                agent_name="query_refinement",
                operation="fallback",
                cost_type="saved",
                estimated_cost=self.cost_estimates["llm_call_gpt4"] * 300,  # Estimate 300 tokens saved
                session_id=session_id,
                processing_time_ms=cost_savings.get("processing_time_ms"),
                metadata={"fallback_type": "pattern_based"}
            )
        else:
            # New LLM call made
            self.track_cost(
                agent_name="query_refinement",
                operation="llm_call",
                cost_type="api_call",
                estimated_cost=self.cost_estimates["llm_call_gpt4"] * 300,  # Estimate 300 tokens
                session_id=session_id,
                tokens_used=300,  # Estimate
                processing_time_ms=cost_savings.get("processing_time_ms"),
                metadata={
                    "generated_fresh": True,
                    "query_category": refinement_result.get("query_category")
                }
            )
    
    def track_retriever_cost(
        self,
        session_id: Optional[str],
        retrieval_metadata: Dict[str, Any]
    ) -> None:
        """Track costs from retriever agent."""
        cost_savings = retrieval_metadata.get("retrieval_cost_savings", {})
        
        if cost_savings.get("cache_hit"):
            # Cache hit - minimal cost
            searches_saved = cost_savings.get("vector_searches_saved", 1)
            self.track_cost(
                agent_name="retriever",
                operation="cache_hit",
                cost_type="saved",
                estimated_cost=self.cost_estimates["vector_search"] * searches_saved,
                session_id=session_id,
                processing_time_ms=cost_savings.get("processing_time_ms"),
                metadata={
                    "searches_saved": searches_saved,
                    "similarity": retrieval_metadata.get("cache_similarity", 0.0),
                    "documents_reused": retrieval_metadata.get("final_returned", 0)
                }
            )
        else:
            # New vector searches performed
            searches_performed = retrieval_metadata.get("queries_searched", 1)
            self.track_cost(
                agent_name="retriever",
                operation="vector_search",
                cost_type="api_call",
                estimated_cost=self.cost_estimates["vector_search"] * searches_performed,
                session_id=session_id,
                processing_time_ms=cost_savings.get("processing_time_ms"),
                metadata={
                    "searches_performed": searches_performed,
                    "documents_found": retrieval_metadata.get("final_returned", 0),
                    "total_candidates": retrieval_metadata.get("total_found", 0)
                }
            )
    
    def track_conversation_memory_cost(
        self,
        session_id: Optional[str],
        response_type: str,
        processing_time_ms: Optional[int] = None
    ) -> None:
        """Track costs from conversation memory agent."""
        if response_type == "chat":
            # Chat response using only memory
            self.track_cost(
                agent_name="conversation_memory",
                operation="llm_call",
                cost_type="api_call",
                estimated_cost=self.cost_estimates["llm_call_gpt35"] * 500,  # Estimate 500 tokens
                session_id=session_id,
                tokens_used=500,
                processing_time_ms=processing_time_ms,
                metadata={"response_type": "chat_only"}
            )
        elif response_type == "hybrid":
            # Hybrid response combining memory + retrieval
            self.track_cost(
                agent_name="conversation_memory",
                operation="llm_call",
                cost_type="api_call",
                estimated_cost=self.cost_estimates["llm_call_gpt4"] * 800,  # Estimate 800 tokens
                session_id=session_id,
                tokens_used=800,
                processing_time_ms=processing_time_ms,
                metadata={"response_type": "hybrid"}
            )
    
    def get_cost_summary(self, time_range_hours: int = 24) -> Dict[str, Any]:
        """Get cost summary for the specified time range."""
        cutoff_time = datetime.now() - timedelta(hours=time_range_hours)
        recent_entries = [e for e in self.cost_entries if e.timestamp >= cutoff_time]
        
        if not recent_entries:
            return {"error": "No cost data available for the specified time range"}
        
        # Calculate totals
        total_cost = sum(e.estimated_cost for e in recent_entries if e.cost_type != "saved")
        total_saved = sum(e.estimated_cost for e in recent_entries if e.cost_type == "saved")
        
        # Group by agent
        agent_costs = {}
        for entry in recent_entries:
            agent = entry.agent_name
            if agent not in agent_costs:
                agent_costs[agent] = {"spent": 0.0, "saved": 0.0, "operations": 0}
            
            if entry.cost_type == "saved":
                agent_costs[agent]["saved"] += entry.estimated_cost
            else:
                agent_costs[agent]["spent"] += entry.estimated_cost
            
            agent_costs[agent]["operations"] += 1
        
        # Calculate cache hit rates
        cache_hits = len([e for e in recent_entries if e.operation == "cache_hit"])
        total_operations = len([e for e in recent_entries if e.operation in ["cache_hit", "llm_call", "vector_search"]])
        cache_hit_rate = (cache_hits / max(total_operations, 1)) * 100
        
        # Calculate optimization percentage
        optimization_percentage = (total_saved / max(total_cost + total_saved, 1)) * 100
        
        return {
            "time_range_hours": time_range_hours,
            "total_cost": round(total_cost, 4),
            "total_saved": round(total_saved, 4),
            "net_cost": round(total_cost - total_saved, 4),
            "optimization_percentage": round(optimization_percentage, 1),
            "cache_hit_rate": round(cache_hit_rate, 1),
            "total_operations": total_operations,
            "agent_breakdown": agent_costs,
            "cost_trends": {
                "llm_calls_saved": len([e for e in recent_entries if e.operation == "llm_call" and e.cost_type == "saved"]),
                "vector_searches_saved": len([e for e in recent_entries if e.operation == "vector_search" and e.cost_type == "saved"]),
                "fallback_usage": len([e for e in recent_entries if e.operation == "fallback"])
            }
        }
    
    def get_session_cost_breakdown(self, session_id: str) -> Dict[str, Any]:
        """Get detailed cost breakdown for a specific session."""
        if session_id not in self.session_costs:
            return {"error": f"No cost data found for session {session_id}"}
        
        entries = self.session_costs[session_id]
        
        total_cost = sum(e.estimated_cost for e in entries if e.cost_type != "saved")
        total_saved = sum(e.estimated_cost for e in entries if e.cost_type == "saved")
        
        operations = {}
        for entry in entries:
            op_key = f"{entry.agent_name}_{entry.operation}"
            if op_key not in operations:
                operations[op_key] = {"count": 0, "cost": 0.0, "saved": 0.0}
            
            operations[op_key]["count"] += 1
            if entry.cost_type == "saved":
                operations[op_key]["saved"] += entry.estimated_cost
            else:
                operations[op_key]["cost"] += entry.estimated_cost
        
        return {
            "session_id": session_id,
            "total_cost": round(total_cost, 4),
            "total_saved": round(total_saved, 4),
            "net_cost": round(total_cost - total_saved, 4),
            "operations": operations,
            "efficiency_score": round((total_saved / max(total_cost + total_saved, 1)) * 100, 1),
            "entry_count": len(entries)
        }
    
    def export_cost_data(self, time_range_hours: int = 24) -> List[Dict[str, Any]]:
        """Export cost data for external analysis."""
        cutoff_time = datetime.now() - timedelta(hours=time_range_hours)
        recent_entries = [e for e in self.cost_entries if e.timestamp >= cutoff_time]
        
        return [
            {
                "timestamp": entry.timestamp.isoformat(),
                "session_id": entry.session_id,
                "agent_name": entry.agent_name,
                "operation": entry.operation,
                "cost_type": entry.cost_type,
                "estimated_cost": entry.estimated_cost,
                "tokens_used": entry.tokens_used,
                "processing_time_ms": entry.processing_time_ms,
                "metadata": entry.metadata
            }
            for entry in recent_entries
        ]
    
    def clear_old_entries(self, days_to_keep: int = 7) -> int:
        """Clear old cost entries to manage memory."""
        cutoff_time = datetime.now() - timedelta(days=days_to_keep)
        
        original_count = len(self.cost_entries)
        self.cost_entries = [e for e in self.cost_entries if e.timestamp >= cutoff_time]
        
        # Clean session costs too
        for session_id in list(self.session_costs.keys()):
            session_entries = [e for e in self.session_costs[session_id] if e.timestamp >= cutoff_time]
            if session_entries:
                self.session_costs[session_id] = session_entries
            else:
                del self.session_costs[session_id]
        
        removed_count = original_count - len(self.cost_entries)
        return removed_count


# Global cost tracker instance
cost_tracker = CostTracker()