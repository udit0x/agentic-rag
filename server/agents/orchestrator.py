"""LangGraph orchestrator for multi-agent workflow."""
from typing import Dict, Any, List
from datetime import datetime
import asyncio
from langgraph.graph import StateGraph, END
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from server.agents.state import AgentState, WorkflowConfig, DEFAULT_CONFIG
from server.agents.router import router_agent
from server.agents.retriever import retriever_agent
from server.agents.reasoning import reasoning_agent
from server.agents.simulation import simulation_agent
from server.agents.temporal import temporal_agent
from server.agents.general_knowledge import general_knowledge_agent
from server.agents.query_refinement import query_refinement_agent

class MultiAgentOrchestrator:
    """LangGraph-based orchestrator for multi-agent RAG workflow."""
    
    def __init__(self, config: WorkflowConfig = None):
        self.config = config or DEFAULT_CONFIG
        self.workflow = self._build_workflow()
        self.app = self.workflow.compile()
    
    def _build_workflow(self) -> StateGraph:
        """Build the LangGraph workflow."""
        workflow = StateGraph(AgentState)
        
        # Add nodes for each agent
        workflow.add_node("router", self._router_node)
        workflow.add_node("query_refinement", self._query_refinement_node)
        workflow.add_node("retriever", self._retriever_node)
        workflow.add_node("reasoning", self._reasoning_node)
        workflow.add_node("simulation", self._simulation_node)  # Placeholder for Phase 3
        workflow.add_node("temporal", self._temporal_node)      # Placeholder for Phase 4
        workflow.add_node("general_knowledge", self._general_knowledge_node)  # General knowledge agent
        
        # Define the workflow edges
        workflow.set_entry_point("router")
        
        # Router determines the path based on classification
        workflow.add_conditional_edges(
            "router",
            self._error_check_route,
            {
                "continue": "query_refinement",  # No errors, continue to refinement
                "stop": END                      # API error detected, stop workflow
            }
        )
        
        # After refinement, check for errors before continuing
        workflow.add_conditional_edges(
            "query_refinement",
            self._error_check_route,
            {
                "continue": "retriever",  # No errors, continue to retrieval
                "stop": END              # API error detected, stop workflow
            }
        )
        
        # After retrieval, check for errors then route based on classification
        workflow.add_conditional_edges(
            "retriever", 
            self._post_retrieval_route_with_error_check,
            {
                "reasoning": "reasoning",
                "simulation": "simulation", 
                "temporal": "temporal",
                "general": "general_knowledge",  # Fallback to general knowledge if no docs
                "stop": END                      # API error detected, stop workflow
            }
        )
        
        # All reasoning paths end the workflow
        workflow.add_edge("reasoning", END)
        workflow.add_edge("simulation", END)
        workflow.add_edge("temporal", END)
        workflow.add_edge("general_knowledge", END)
        
        return workflow
    
    async def _router_node(self, state: AgentState) -> AgentState:
        """Router agent node - classifies the query."""
        start_time = datetime.now()
        
        try:
            classification = await router_agent.classify_query(
                state["query"], 
                enable_tracing=self.config["enable_tracing"]
            )
            
            state["classification"] = classification
            
            # Add trace if enabled
            if self.config["enable_tracing"]:
                trace = router_agent.create_trace(
                    state["query"], 
                    classification, 
                    start_time
                )
                state["agent_traces"].append(trace)
                
                # Add to intermediate steps for debugging
                state["intermediate_steps"].append({
                    "step": "router",
                    "classification": classification,
                    "timestamp": datetime.now().isoformat()
                })
            
            return state
            
        except Exception as e:
            # Enhanced error detection and categorization
            error_msg = str(e)
            
            # Detect specific API errors for better user feedback (order matters!)
            if "401" in error_msg and "api" in error_msg.lower():
                state["error_message"] = f"API authentication failed: {error_msg}"
                state["error_type"] = "api_authentication_failed"
            elif "429" in error_msg and ("quota" in error_msg.lower() or "rate limit" in error_msg.lower()):
                state["error_message"] = f"API quota exceeded: {error_msg}"
                state["error_type"] = "api_quota_exceeded"
            elif ("openai" in error_msg.lower() or "azure" in error_msg.lower()) and ("api" in error_msg.lower() or "connection" in error_msg.lower()):
                state["error_message"] = f"API connection error: {error_msg}"
                state["error_type"] = "api_connection_error"
            else:
                state["error_message"] = f"Router agent failed: {error_msg}"
                state["error_type"] = "agent_error"
            
            if self.config["enable_tracing"]:
                trace = router_agent.create_trace(
                    state["query"], 
                    None, 
                    start_time, 
                    error=state["error_message"]
                )
                state["agent_traces"].append(trace)
            
            return state
    
    async def _query_refinement_node(self, state: AgentState) -> AgentState:
        """Query refinement node - generates 5 related questions."""
        start_time = datetime.now()
        
        try:
            refinement = await query_refinement_agent.generate_related_questions(
                state["query"]
            )
            
            # Check if refinement failed due to API error
            if refinement.query_category == "api_error":
                print("[ORCHESTRATOR] Query refinement detected API error - stopping workflow")
                
                # Parse the actual error type from the reasoning field
                reasoning = refinement.refinement_reasoning or ""
                
                if "api_authentication_failed" in reasoning:
                    state["error_message"] = "API authentication failed during query refinement"
                    state["error_type"] = "api_authentication_failed"
                elif "api_quota_exceeded" in reasoning:
                    state["error_message"] = "API quota exceeded during query refinement"
                    state["error_type"] = "api_quota_exceeded"
                elif "api_connection_error" in reasoning:
                    state["error_message"] = "API connection error during query refinement"
                    state["error_type"] = "api_connection_error"
                else:
                    # Fallback if parsing fails
                    state["error_message"] = "API service unavailable during query refinement"
                    state["error_type"] = "api_connection_error" 
                
                if self.config["enable_tracing"]:
                    trace = {
                        "agent_name": "query_refinement",
                        "start_time": start_time,
                        "end_time": datetime.now(),
                        "duration_ms": int((datetime.now() - start_time).total_seconds() * 1000),
                        "input_data": {"query": state["query"]},
                        "output_data": {},
                        "error": "API service unavailable - unable to generate related questions"
                    }
                    state["agent_traces"].append(trace)
                
                return state
            
            # Store successful refinement in state 
            state["query_refinement"] = {
                "original_query": refinement.original_query,
                "refined_queries": refinement.refined_queries,
                "query_category": refinement.query_category,
                "refinement_reasoning": refinement.refinement_reasoning
            }
            
            # Add trace if enabled
            if self.config["enable_tracing"]:
                trace = {
                    "agent_name": "query_refinement",
                    "start_time": start_time,
                    "end_time": datetime.now(),
                    "duration_ms": int((datetime.now() - start_time).total_seconds() * 1000),
                    "input_data": {"query": state["query"]},
                    "output_data": {
                        "refined_queries": refinement.refined_queries,
                        "category": refinement.query_category
                    },
                    "error": None
                }
                state["agent_traces"].append(trace)
                
                state["intermediate_steps"].append({
                    "step": "query_refinement",
                    "refined_queries": refinement.refined_queries,
                    "timestamp": datetime.now().isoformat()
                })
            
            return state
            
        except Exception as e:
            # Enhanced error detection for query refinement
            error_msg = str(e)
            
            # Detect specific API errors (order matters - most specific first!)
            if "401" in error_msg and "api" in error_msg.lower():
                state["error_message"] = f"API authentication failed during query refinement: {error_msg}"
                state["error_type"] = "api_authentication_failed"
            elif "429" in error_msg and ("quota" in error_msg.lower() or "rate limit" in error_msg.lower()):
                state["error_message"] = f"API quota exceeded during query refinement: {error_msg}"
                state["error_type"] = "api_quota_exceeded"
            elif ("openai" in error_msg.lower() or "azure" in error_msg.lower()) and ("api" in error_msg.lower() or "connection" in error_msg.lower()):
                state["error_message"] = f"API connection error during query refinement: {error_msg}"
                state["error_type"] = "api_connection_error"
            else:
                state["error_message"] = f"Query refinement failed: {error_msg}"
                state["error_type"] = "agent_error"
            
            if self.config["enable_tracing"]:
                trace = {
                    "agent_name": "query_refinement",
                    "start_time": start_time,
                    "end_time": datetime.now(),
                    "duration_ms": int((datetime.now() - start_time).total_seconds() * 1000),
                    "input_data": {"query": state["query"]},
                    "output_data": {},
                    "error": state["error_message"]
                }
                state["agent_traces"].append(trace)
            
            return state
    
    async def _retriever_node(self, state: AgentState) -> AgentState:
        """Retriever agent node - fetches relevant documents."""
        start_time = datetime.now()
        
        try:
            if not state.get("classification"):
                raise ValueError("No classification available for retrieval")
            
            # Get refined queries if available
            refined_queries = None
            if state.get("query_refinement"):
                refined_queries = state["query_refinement"].get("refined_queries", [])
            
            chunks, metadata = await retriever_agent.retrieve_documents(
                state["query"],
                state["classification"],
                max_chunks=self.config["max_chunks"],
                enable_tracing=self.config["enable_tracing"],
                refined_queries=refined_queries
            )
            
            state["retrieved_chunks"] = chunks
            state["retrieval_metadata"] = metadata
            
            # Add trace if enabled
            if self.config["enable_tracing"]:
                trace = retriever_agent.create_trace(
                    state["query"],
                    state["classification"],
                    chunks,
                    metadata,
                    start_time
                )
                state["agent_traces"].append(trace)
                
                state["intermediate_steps"].append({
                    "step": "retriever",
                    "chunks_found": len(chunks),
                    "metadata": metadata,
                    "timestamp": datetime.now().isoformat()
                })
            
            return state
            
        except Exception as e:
            # Enhanced error detection for retriever
            error_msg = str(e)
            
            # Detect specific API errors (order matters - most specific first!)
            if "401" in error_msg and "api" in error_msg.lower():
                state["error_message"] = f"API authentication failed during document retrieval: {error_msg}"
                state["error_type"] = "api_authentication_failed"
            elif "429" in error_msg and ("quota" in error_msg.lower() or "rate limit" in error_msg.lower()):
                state["error_message"] = f"API quota exceeded during document retrieval: {error_msg}"
                state["error_type"] = "api_quota_exceeded"
            elif ("openai" in error_msg.lower() or "azure" in error_msg.lower()) and ("api" in error_msg.lower() or "connection" in error_msg.lower()):
                state["error_message"] = f"API connection error during document retrieval: {error_msg}"
                state["error_type"] = "api_connection_error"
            else:
                state["error_message"] = f"Retriever agent failed: {error_msg}"
                state["error_type"] = "agent_error"
            
            if self.config["enable_tracing"]:
                trace = retriever_agent.create_trace(
                    state["query"],
                    state.get("classification", {}),
                    [],
                    {},
                    start_time,
                    error=state["error_message"]
                )
                state["agent_traces"].append(trace)
            
            return state
    
    async def _reasoning_node(self, state: AgentState) -> AgentState:
        """Reasoning agent node - generates factual responses."""
        start_time = datetime.now()
        
        try:
            response = await reasoning_agent.generate_response(
                state["query"],
                state.get("retrieved_chunks", []),
                state.get("classification", {}),
                enable_tracing=self.config["enable_tracing"]
            )
            
            state["reasoning_response"] = response
            state["final_response"] = response
            state["response_type"] = "reasoning"
            state["sources"] = state.get("retrieved_chunks", [])
            
            # Add trace if enabled
            if self.config["enable_tracing"]:
                trace = reasoning_agent.create_trace(
                    state["query"],
                    state.get("retrieved_chunks", []),
                    state.get("classification", {}),
                    response,
                    start_time
                )
                state["agent_traces"].append(trace)
                
                state["intermediate_steps"].append({
                    "step": "reasoning",
                    "response_length": len(response),
                    "timestamp": datetime.now().isoformat()
                })
            
            return state
            
        except Exception as e:
            error_msg = f"Reasoning agent failed: {str(e)}"
            state["error_message"] = error_msg
            state["final_response"] = "I encountered an error while processing your question. Please try again."
            state["response_type"] = "error"
            
            if self.config["enable_tracing"]:
                trace = reasoning_agent.create_trace(
                    state["query"],
                    state.get("retrieved_chunks", []),
                    state.get("classification", {}),
                    "",
                    start_time,
                    error=error_msg
                )
                state["agent_traces"].append(trace)
            
            return state
    
    async def _simulation_node(self, state: AgentState) -> AgentState:
        """Simulation agent node - handles counterfactual scenarios."""
        start_time = datetime.now()
        
        try:
            simulation_result, parameters = await simulation_agent.generate_simulation(
                state["query"],
                state.get("retrieved_chunks", []),
                state.get("classification", {}),
                enable_tracing=self.config["enable_tracing"]
            )
            
            # Format response for simulation
            response = self._format_simulation_response(simulation_result, parameters)
            
            state["simulation_parameters"] = parameters
            state["simulation_result"] = simulation_result
            state["final_response"] = response
            state["response_type"] = "simulation"
            state["sources"] = state.get("retrieved_chunks", [])
            
            # Add trace if enabled
            if self.config["enable_tracing"]:
                trace = simulation_agent.create_trace(
                    state["query"],
                    state.get("retrieved_chunks", []),
                    simulation_result,
                    parameters,
                    start_time
                )
                state["agent_traces"].append(trace)
                
                state["intermediate_steps"].append({
                    "step": "simulation",
                    "current_value": simulation_result["current_value"],
                    "projected_value": simulation_result["projected_value"],
                    "change_percentage": simulation_result["change_percentage"],
                    "timestamp": datetime.now().isoformat()
                })
            
            return state
            
        except Exception as e:
            error_msg = f"Simulation agent failed: {str(e)}"
            state["error_message"] = error_msg
            state["final_response"] = "I encountered an error while processing your simulation. Let me provide a factual response instead."
            state["response_type"] = "error"
            
            if self.config["enable_tracing"]:
                trace = simulation_agent.create_trace(
                    state["query"],
                    state.get("retrieved_chunks", []),
                    {},
                    {},
                    start_time,
                    error=error_msg
                )
                state["agent_traces"].append(trace)
            
            # Fallback to reasoning agent for error cases
            return await self._reasoning_node(state)
    
    async def _temporal_node(self, state: AgentState) -> AgentState:
        """Temporal agent node - handles temporal analysis and knowledge evolution."""
        start_time = datetime.now()
        
        try:
            temporal_analysis = await temporal_agent.process(
                state["query"],
                state.get("retrieved_chunks", [])
            )
            
            # Format response for temporal analysis
            response = self._format_temporal_response(temporal_analysis)
            
            state["temporal_analysis"] = temporal_analysis
            state["final_response"] = response
            state["response_type"] = "temporal"
            state["sources"] = state.get("retrieved_chunks", [])
            
            # Add trace if enabled
            if self.config["enable_tracing"]:
                trace = {
                    "agentName": "temporal",
                    "startTime": start_time.isoformat(),
                    "endTime": datetime.now().isoformat(),
                    "durationMs": int((datetime.now() - start_time).total_seconds() * 1000),
                    "inputData": {
                        "query": state["query"],
                        "chunks_count": len(state.get("retrieved_chunks", []))
                    },
                    "outputData": {
                        "temporal_analysis": {
                            "timeline_events": len(temporal_analysis.get("timeline", [])),
                            "conflicts_found": len(temporal_analysis.get("conflicts", [])),
                            "outdated_items": len(temporal_analysis.get("outdated_information", [])),
                            "confidence_score": temporal_analysis.get("confidence_score", 0.0),
                            "most_recent_date": temporal_analysis.get("most_recent_date").isoformat() if temporal_analysis.get("most_recent_date") else None
                        },
                        "chunks_used": len(state.get("retrieved_chunks", []))
                    },
                    "error": None
                }
                state["agent_traces"].append(trace)
                
                state["intermediate_steps"].append({
                    "step": "temporal",
                    "timeline_events": len(temporal_analysis.get("timeline", [])),
                    "conflicts_found": len(temporal_analysis.get("conflicts", [])),
                    "confidence_score": temporal_analysis.get("confidence_score", 0.0),
                    "timestamp": datetime.now().isoformat()
                })
            
            return state
            
        except Exception as e:
            error_msg = f"Temporal agent failed: {str(e)}"
            state["error_message"] = error_msg
            state["final_response"] = f"I encountered an error during temporal analysis: {str(e)}"
            state["response_type"] = "error"
            
            if self.config["enable_tracing"]:
                trace = {
                    "agentName": "temporal",
                    "startTime": start_time.isoformat(),
                    "endTime": datetime.now().isoformat(),
                    "durationMs": int((datetime.now() - start_time).total_seconds() * 1000),
                    "inputData": {
                        "query": state["query"],
                        "chunks_count": len(state.get("retrieved_chunks", []))
                    },
                    "outputData": None,
                    "error": error_msg
                }
                state["agent_traces"].append(trace)
            
            # Fallback to reasoning agent for error cases
            return await self._reasoning_node(state)
    
    async def _general_knowledge_node(self, state: AgentState) -> AgentState:
        """General knowledge agent node - provides responses using foundational AI knowledge."""
        start_time = datetime.now()
        
        try:
            response = await general_knowledge_agent.generate_response(
                state["query"],
                state.get("classification", {}),
                enable_tracing=self.config["enable_tracing"]
            )
            
            state["final_response"] = response
            state["response_type"] = "general_knowledge"
            state["sources"] = []  # No document sources for general knowledge
            
            # Add trace if enabled
            if self.config["enable_tracing"]:
                trace = general_knowledge_agent.create_trace(
                    state["query"],
                    state.get("classification", {}),
                    response,
                    start_time
                )
                state["agent_traces"].append(trace)
                
                state["intermediate_steps"].append({
                    "step": "general_knowledge",
                    "response_length": len(response),
                    "used_general_knowledge": True,
                    "timestamp": datetime.now().isoformat()
                })
            
            return state
            
        except Exception as e:
            error_msg = f"General Knowledge agent failed: {str(e)}"
            state["error_message"] = error_msg
            state["final_response"] = "I encountered an error while processing your question using general knowledge. Please try again."
            state["response_type"] = "error"
            
            if self.config["enable_tracing"]:
                trace = general_knowledge_agent.create_trace(
                    state["query"],
                    state.get("classification", {}),
                    "",
                    start_time,
                    error=error_msg
                )
                state["agent_traces"].append(trace)
            
            return state
    
    def _format_simulation_response(self, simulation_result: dict, parameters: dict) -> str:
        """Format simulation results into a readable response."""
        current = simulation_result["current_value"]
        projected = simulation_result["projected_value"]
        change_amt = simulation_result["change_amount"]
        change_pct = simulation_result["change_percentage"]
        
        # Format currency if values are large
        def format_value(value):
            if abs(value) >= 1000000:
                return f"${value/1000000:.1f}M"
            elif abs(value) >= 1000:
                return f"${value/1000:.1f}K"
            else:
                return f"${value:.2f}"
        
        response = f"""**Simulation Results:**

**Current Scenario:** {format_value(current)}
**Projected Scenario:** {format_value(projected)}
**Change:** {format_value(change_amt)} ({change_pct:+.1f}%)

**Analysis:**
Based on the scenario described in your query, here's the quantitative impact:

"""
        
        if change_pct > 0:
            response += f"• This represents an **increase** of {abs(change_pct):.1f}%\n"
            response += f"• The additional value would be {format_value(abs(change_amt))}\n"
        elif change_pct < 0:
            response += f"• This represents a **decrease** of {abs(change_pct):.1f}%\n"
            response += f"• The reduction would be {format_value(abs(change_amt))}\n"
        else:
            response += "• No change from the current value\n"
        
        # Add assumptions
        if simulation_result.get("assumptions"):
            response += "\n**Key Assumptions:**\n"
            for assumption in simulation_result["assumptions"][:3]:  # Limit to top 3
                response += f"• {assumption}\n"
        
        # Add methodology
        if simulation_result.get("methodology"):
            response += f"\n**Methodology:** {simulation_result['methodology']}\n"
        
        response += "\n*Note: This is a simplified projection. Real-world scenarios may involve additional variables and constraints.*"
        
        return response
    
    def _format_temporal_response(self, temporal_analysis: dict) -> str:
        """Format temporal analysis results into a readable response."""
        timeline = temporal_analysis.get("timeline", [])
        conflicts = temporal_analysis.get("conflicts", [])
        outdated_info = temporal_analysis.get("outdated_information", [])
        confidence = temporal_analysis.get("confidence_score", 0.0)
        most_recent = temporal_analysis.get("most_recent_date")
        
        # New AI-driven fields
        analysis_focus = temporal_analysis.get("analysis_focus", "")
        evolution_summary = temporal_analysis.get("evolution_summary", "")
        current_state = temporal_analysis.get("current_state", "")
        recommendations = temporal_analysis.get("recommendations", "")
        relevant_docs = temporal_analysis.get("relevant_documents", [])
        excluded_docs = temporal_analysis.get("excluded_documents", [])
        data_quality_note = temporal_analysis.get("data_quality_note", "")
        
        response = "**📊 Temporal Evolution Analysis**\n\n"
        
        # Document relevance section
        if relevant_docs or excluded_docs:
            response += "**📄 Document Analysis:**\n"
            if relevant_docs:
                response += f"✅ **Relevant Sources**: {', '.join(relevant_docs)}\n"
            if excluded_docs:
                response += f"🚫 **Excluded Sources**: {', '.join(excluded_docs)} (not relevant to query)\n"
            response += "\n"
        
        # Data quality note
        if data_quality_note:
            response += f"**ℹ️ Analysis Note**: {data_quality_note}\n\n"
        
        # Analysis focus
        if analysis_focus:
            response += f"**🎯 Analysis Focus:** {analysis_focus}\n\n"
        
        # Evolution summary - the key narrative
        if evolution_summary:
            response += f"**📈 Evolution Summary:**\n{evolution_summary}\n\n"
        
        # Timeline section with better formatting
        if timeline:
            response += "**📅 Key Timeline Events:**\n"
            for event in timeline[:8]:  # Show more events, up to 8
                date = event.get("date", "Unknown")
                description = event.get("description", "")
                change_type = event.get("change_type", "").lower()
                event_confidence = event.get("confidence", 0.0)
                
                # More nuanced icons based on event type
                if change_type in ["introduction", "launch", "addition"]:
                    icon = "🚀"
                elif change_type in ["enhancement", "improvement", "update"]:
                    icon = "⬆️"
                elif change_type in ["change", "modification"]:
                    icon = "🔄"
                elif change_type in ["deprecation", "removal"]:
                    icon = "⛔"
                else:
                    icon = "�"
                
                # Add confidence indicator for important events
                confidence_indicator = ""
                if event_confidence >= 0.8:
                    confidence_indicator = " ✅"
                elif event_confidence < 0.5:
                    confidence_indicator = " ❓"
                
                response += f"{icon} **{date}**: {description}{confidence_indicator}\n"
            response += "\n"
        
        # Current state
        if current_state:
            response += f"**🎯 Current State:**\n{current_state}\n\n"
        
        # Conflicts section with better formatting
        if conflicts:
            response += "**⚠️ Information Evolution & Conflicts:**\n"
            for i, conflict in enumerate(conflicts[:3], 1):  # Limit to 3 conflicts
                topic = conflict.get("topic", f"Conflict {i}")
                description = conflict.get("description", "")
                resolution = conflict.get("resolution", "")
                conf_score = conflict.get("confidence", 0.0)
                
                response += f"**{i}. {topic}** (Confidence: {conf_score:.1f})\n"
                if description:
                    response += f"   📝 {description}\n"
                if resolution:
                    response += f"   💡 **Resolution**: {resolution}\n"
                response += "\n"
        else:
            response += "**✅ No conflicts detected** - Information appears consistent across time periods.\n\n"
        
        # Outdated information section
        if outdated_info:
            response += "**🚨 Outdated Information:**\n"
            for item in outdated_info[:3]:  # Limit to 3 items
                response += f"• {item}\n"
            response += "\n"
        
        # Recommendations section
        if recommendations:
            response += f"**💡 Recommendations:**\n{recommendations}\n\n"
        
        # Most recent information and confidence
        if most_recent:
            response += f"**📍 Most Recent Information:** {most_recent.strftime('%Y-%m-%d')}\n\n"
        else:
            response += f"**📍 Most Recent Information:** No specific dates found in documents\n\n"
        
        # Confidence assessment with more descriptive language
        if confidence >= 0.8:
            confidence_desc = "High"
            confidence_emoji = "🟢"
        elif confidence >= 0.6:
            confidence_desc = "Good"
            confidence_emoji = "🟡"
        elif confidence >= 0.4:
            confidence_desc = "Medium"
            confidence_emoji = "🟠"
        else:
            confidence_desc = "Low"
            confidence_emoji = "🔴"
        
        response += f"{confidence_emoji} **Analysis Confidence:** {confidence_desc} ({confidence:.1f})\n\n"
        
        # Summary note
        response += "✨ **Summary:** This analysis examines how information has evolved over time based on the available documents. "
        if confidence < 0.6:
            response += "Consider uploading additional documents with clear timestamps for more comprehensive analysis."
        else:
            response += "The temporal progression shows meaningful evolution in the analyzed domain."
        
        return response
    
    def _error_check_route(self, state: AgentState) -> str:
        """Check for API errors and determine if workflow should continue or stop."""
        error_message = state.get("error_message")
        error_type = state.get("error_type")
        
        # If there's an API error, stop the workflow immediately
        if error_message and error_type in ["api_quota_exceeded", "api_authentication_failed", "api_connection_error"]:
            print(f"[ORCHESTRATOR] API error detected: {error_type} - stopping workflow")
            return "stop"
        
        # No API errors, continue with normal flow
        return "continue"
    
    def _route_decision(self, state: AgentState) -> str:
        """Determine routing after classification."""
        classification = state.get("classification")
        if not classification:
            return "factual"  # Default fallback
        
        return classification["type"]
    
    def _post_retrieval_route_with_error_check(self, state: AgentState) -> str:
        """Check for errors first, then determine routing after retrieval."""
        # First check for API errors
        error_message = state.get("error_message")
        error_type = state.get("error_type")
        
        if error_message and error_type in ["api_quota_exceeded", "api_authentication_failed", "api_connection_error"]:
            print(f"[ORCHESTRATOR] API error detected in retriever: {error_type} - stopping workflow")
            return "stop"
        
        # No API errors, continue with normal routing logic
        return self._post_retrieval_route(state)
    
    def _post_retrieval_route(self, state: AgentState) -> str:
        """Determine routing after retrieval based on classification and results."""
        classification = state.get("classification", {})
        query_type = classification.get("type", "factual")
        retrieved_chunks = state.get("retrieved_chunks", [])
        use_general_knowledge = classification.get("use_general_knowledge", False)
        
        # If no documents found and general knowledge is enabled, route to general knowledge
        if not retrieved_chunks and use_general_knowledge:
            return "general"
        
        # Otherwise route based on original classification
        if query_type == "factual":
            return "reasoning"
        elif query_type == "counterfactual":
            return "simulation"  # Phase 3
        elif query_type == "temporal":
            return "temporal"    # Phase 4
        else:
            return "reasoning"   # Default fallback
    
    async def process_query(
        self, 
        query: str, 
        session_id: str = None,
        user_id: str = None
    ) -> AgentState:
        """
        Process a query through the multi-agent workflow.
        
        Args:
            query: User's question
            session_id: Optional session identifier
            user_id: Optional user identifier
            
        Returns:
            Final state with response and traces
        """
        start_time = datetime.now()
        
        # Initialize state
        initial_state: AgentState = {
            "query": query,
            "session_id": session_id,
            "user_id": user_id,
            "classification": None,
            "retrieved_chunks": [],
            "retrieval_metadata": None,
            "reasoning_response": None,
            "simulation_parameters": None,
            "simulation_result": None,
            "temporal_analysis": None,
            "final_response": "",
            "response_type": "reasoning",
            "sources": [],
            "agent_traces": [],
            "total_execution_time": None,
            "error_message": None,
            "error_type": None,
            "debug_info": None,
            "intermediate_steps": []
        }
        
        try:
            # Execute the workflow
            final_state = await self.app.ainvoke(initial_state)
            
            # Check if workflow stopped due to API error
            if final_state.get("error_message") and not final_state.get("final_response"):
                error_type = final_state.get("error_type", "general_error")
                
                # Generate appropriate error response based on error type
                if error_type == "api_quota_exceeded":
                    final_state["final_response"] = "🚫 **API Quota Exceeded**\n\nThe OpenAI API quota has been exceeded. Please:\n- Check your OpenAI billing and usage limits\n- Verify your API key is valid and has sufficient credits\n- Try again later when your quota resets"
                elif error_type == "api_authentication_failed":
                    final_state["final_response"] = "🔑 **API Authentication Failed**\n\nThere's an issue with your API configuration:\n- Check that your API key is correct\n- Verify your API endpoint is properly configured\n- Ensure your API key has the necessary permissions"
                elif error_type == "api_connection_error":
                    final_state["final_response"] = "🌐 **API Connection Error**\n\nUnable to connect to the AI service:\n- Check your internet connection\n- Verify the API endpoint is accessible\n- The service might be temporarily unavailable"
                else:
                    final_state["final_response"] = f"⚠️ **Processing Error**\n\nI encountered an error while processing your question: {final_state['error_message']}\n\nPlease try again or check your configuration."
                
                final_state["response_type"] = "error"
                print(f"[ORCHESTRATOR] Workflow stopped early due to {error_type}")
            
            # Calculate total execution time
            if self.config["enable_tracing"]:
                end_time = datetime.now()
                total_ms = int((end_time - start_time).total_seconds() * 1000)
                final_state["total_execution_time"] = total_ms
                
                if self.config["debug_mode"]:
                    final_state["debug_info"] = {
                        "config": self.config,
                        "workflow_start": start_time.isoformat(),
                        "workflow_end": end_time.isoformat(),
                        "total_agents": len(final_state["agent_traces"])
                    }
            
            return final_state
            
        except Exception as e:
            # Handle workflow-level errors with enhanced detection
            error_msg = str(e)
            final_state = initial_state.copy()
            
            # Detect specific API errors at workflow level (order matters!)
            if "401" in error_msg and "api" in error_msg.lower():
                final_state["error_message"] = f"API authentication failed: {error_msg}"
                final_state["error_type"] = "api_authentication_failed"
            elif "429" in error_msg and ("quota" in error_msg.lower() or "rate limit" in error_msg.lower()):
                final_state["error_message"] = f"API quota exceeded: {error_msg}"
                final_state["error_type"] = "api_quota_exceeded"
            elif ("openai" in error_msg.lower() or "azure" in error_msg.lower()) and ("api" in error_msg.lower() or "connection" in error_msg.lower()):
                final_state["error_message"] = f"API connection error: {error_msg}"
                final_state["error_type"] = "api_connection_error"
            else:
                final_state["error_message"] = f"Workflow execution failed: {error_msg}"
                final_state["error_type"] = "workflow_error"
            
            final_state["final_response"] = "I encountered an error while processing your question. Please try again."
            final_state["response_type"] = "error"
            
            if self.config["enable_tracing"]:
                end_time = datetime.now()
                total_ms = int((end_time - start_time).total_seconds() * 1000)
                final_state["total_execution_time"] = total_ms
            
            return final_state

# Global orchestrator instance
orchestrator = MultiAgentOrchestrator()