"""Simulation Agent for counterfactual reasoning with quantitative projections."""
import re
import ast
import operator
from typing import Dict, Any, List, Optional, Union
from datetime import datetime
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from server.providers import get_llm
from server.agents.state import DocumentChunk, QueryClassification, SimulationParameters, SimulationResult, AgentTrace

class ParameterExtractionOutput(BaseModel):
    """Pydantic model for structured parameter extraction."""
    base_value: Optional[float] = Field(description="Base numerical value found in documents")
    change_percentage: Optional[float] = Field(description="Percentage change requested (e.g., 15 for 15%)")
    change_amount: Optional[float] = Field(description="Absolute change amount")
    scenario_description: str = Field(description="Human-readable description of the scenario")
    variables: Dict[str, Any] = Field(description="Key variables and their values")
    operation: str = Field(description="Type of operation: increase, decrease, multiply, etc.")

# Parameter extraction prompt
PARAMETER_EXTRACTION_PROMPT = """You are an expert financial analyst that extracts numerical parameters from "what-if" scenario queries.

Context from documents:
{context}

Query: "{query}"

Your task is to extract:
1. **Base Value**: Current numerical value from the documents (revenue, cost, price, etc.)
2. **Change**: What change is being requested (percentage, amount, multiplier)
3. **Operation**: Type of change (increase, decrease, multiply, set to)
4. **Variables**: Key metrics and their current values

Examples:
- "What if revenue increased by 15%" → base_value: 1000000, change_percentage: 15, operation: "increase"
- "If Azure costs doubled" → base_value: 50000, change_percentage: 100, operation: "multiply"
- "Suppose we hired 10 more developers at $120k" → base_value: 0, change_amount: 1200000, operation: "add"

Return your analysis as JSON:
{{
    "base_value": number or null,
    "change_percentage": number or null,
    "change_amount": number or null,
    "scenario_description": "clear description",
    "variables": {{"key": "value"}},
    "operation": "increase|decrease|multiply|add|set"
}}"""

# Simulation calculation prompt
SIMULATION_PROMPT = """You are a financial modeling expert. Calculate the projected scenario based on the parameters.

Base Information:
- Current Value: {base_value}
- Operation: {operation}
- Change: {change_value}

Context: {scenario_description}

Calculate:
1. **Projected Value**: Apply the change to the base value
2. **Impact Analysis**: Calculate absolute and percentage changes
3. **Assumptions**: List key assumptions made
4. **Methodology**: Explain the calculation approach

Return detailed calculation results as JSON:
{{
    "current_value": {base_value},
    "projected_value": calculated_result,
    "change_amount": absolute_difference,
    "change_percentage": percentage_difference,
    "assumptions": ["assumption1", "assumption2"],
    "methodology": "explanation of calculation",
    "confidence": 0.8
}}"""

class SafeCalculator:
    """Safe calculator for numerical operations with restricted functionality."""
    
    # Allowed operations
    ALLOWED_OPERATORS = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.Mod: operator.mod,
        ast.Pow: operator.pow,
        ast.USub: operator.neg,
        ast.UAdd: operator.pos,
    }
    
    def __init__(self):
        self.max_number = 1e12  # Prevent overflow
        self.max_recursion = 10
        
    def safe_eval(self, expression: str, variables: Dict[str, float] = None) -> float:
        """Safely evaluate a mathematical expression."""
        variables = variables or {}
        
        try:
            # Parse the expression
            node = ast.parse(expression.strip(), mode='eval')
            return self._eval_node(node.body, variables, 0)
        except Exception as e:
            raise ValueError(f"Invalid expression: {e}")
    
    def _eval_node(self, node: ast.AST, variables: Dict[str, float], depth: int) -> float:
        """Recursively evaluate AST nodes."""
        if depth > self.max_recursion:
            raise ValueError("Expression too complex")
        
        if isinstance(node, ast.Constant):  # Python 3.8+
            if isinstance(node.value, (int, float)):
                if abs(node.value) > self.max_number:
                    raise ValueError("Number too large")
                return float(node.value)
            else:
                raise ValueError("Only numbers allowed")
        
        elif isinstance(node, ast.Name):
            if node.id in variables:
                return float(variables[node.id])
            else:
                raise ValueError(f"Unknown variable: {node.id}")
        
        elif isinstance(node, ast.BinOp):
            left = self._eval_node(node.left, variables, depth + 1)
            right = self._eval_node(node.right, variables, depth + 1)
            
            if type(node.op) not in self.ALLOWED_OPERATORS:
                raise ValueError(f"Operation not allowed: {type(node.op)}")
            
            result = self.ALLOWED_OPERATORS[type(node.op)](left, right)
            
            if abs(result) > self.max_number:
                raise ValueError("Result too large")
            
            return result
        
        elif isinstance(node, ast.UnaryOp):
            operand = self._eval_node(node.operand, variables, depth + 1)
            
            if type(node.op) not in self.ALLOWED_OPERATORS:
                raise ValueError(f"Operation not allowed: {type(node.op)}")
            
            return self.ALLOWED_OPERATORS[type(node.op)](operand)
        
        else:
            raise ValueError(f"Node type not allowed: {type(node)}")

class SimulationAgent:
    """Agent responsible for counterfactual reasoning with quantitative projections."""
    
    def __init__(self):
        # Get LLM dynamically from provider
        self.llm = None
        self.calculator = SafeCalculator()
        
        # Parameter extraction chain
        self.extraction_prompt = ChatPromptTemplate.from_template(PARAMETER_EXTRACTION_PROMPT)
        self.extraction_parser = JsonOutputParser(pydantic_object=ParameterExtractionOutput)
        
        # Simulation calculation chain  
        self.simulation_prompt = ChatPromptTemplate.from_template(SIMULATION_PROMPT)
        self.simulation_parser = JsonOutputParser()
        
        # Build chains only if LLM available
        self.extraction_chain = None
        self.simulation_chain = None
    
    def _get_llm(self):
        """Get the current LLM instance."""
        if self.llm is None:
            try:
                self.llm = get_llm()
                # Rebuild chains when LLM is available
                self._build_chains()
            except Exception as e:
                print(f"[SIMULATION_AGENT] Error getting LLM: {e}")
                return None
        return self.llm
    
    def _build_chains(self):
        """Build the chains with current LLM."""
        if self.llm:
            self.extraction_chain = (
                self.extraction_prompt 
                | self.llm 
                | self.extraction_parser
            )
            
            self.simulation_chain = (
                self.simulation_prompt
                | self.llm
                | self.simulation_parser
            )
    
    def _extract_numbers_regex(self, text: str) -> List[float]:
        """Extract numbers from text using regex as fallback."""
        # Match various number formats: 15%, $100, 1.5, 1,000, etc.
        patterns = [
            r'\$\d+(?:,\d{3})*(?:\.\d{2})?',  # Currency first (priority)
            r'\b\d+(?:,\d{3})*(?:\.\d+)?',  # Regular numbers
            r'\b\d+\.?\d*%',  # Percentages last
        ]
        
        numbers = []
        for pattern in patterns:
            matches = re.findall(pattern, text)
            for match in matches:
                # Clean and convert
                clean_num = re.sub(r'[%$,]', '', match)
                try:
                    num_value = float(clean_num)
                    # Skip very small numbers that are likely not financial values
                    if num_value >= 1:
                        numbers.append(num_value)
                except ValueError:
                    continue
        
        return numbers
    
    def _fallback_parameter_extraction(
        self, 
        query: str, 
        chunks: List[DocumentChunk]
    ) -> SimulationParameters:
        """Fallback parameter extraction using rule-based approach."""
        
        # Extract numbers from query
        query_numbers = self._extract_numbers_regex(query)
        
        # Extract numbers from document chunks
        doc_numbers = []
        revenue_keywords = ["revenue", "income", "sales", "total revenue"]
        cost_keywords = ["cost", "expense", "salary", "budget"]
        
        for chunk in chunks:
            content = chunk["content"]
            content_lower = content.lower()
            chunk_numbers = self._extract_numbers_regex(content)
            
            # Look for revenue-related numbers in context
            for i, sentence in enumerate(content.split('.')):
                sentence_lower = sentence.lower()
                if any(keyword in sentence_lower for keyword in revenue_keywords):
                    sentence_numbers = self._extract_numbers_regex(sentence)
                    if sentence_numbers:
                        # Prioritize larger numbers for revenue
                        doc_numbers.extend([n for n in sentence_numbers if n >= 100000])
                
                # Look for cost-related numbers if it's a cost query
                if any(word in query.lower() for word in cost_keywords):
                    if any(keyword in sentence_lower for keyword in cost_keywords):
                        sentence_numbers = self._extract_numbers_regex(sentence)
                        doc_numbers.extend(sentence_numbers)
            
            # Add all numbers as fallback
            doc_numbers.extend(chunk_numbers)
        
        # Determine operation type
        operation = "increase"
        if any(word in query.lower() for word in ["decrease", "reduce", "cut", "lower"]):
            operation = "decrease"
        elif any(word in query.lower() for word in ["double", "triple", "multiply"]):
            operation = "multiply"
        elif any(word in query.lower() for word in ["add", "hire", "additional"]):
            operation = "add"
        
        # Find percentage in query
        percentage_match = re.search(r'(\d+(?:\.\d+)?)%', query)
        change_percentage = float(percentage_match.group(1)) if percentage_match else None
        
        # Use largest document number as base value, prioritizing revenue-like amounts
        base_value = None
        if doc_numbers:
            # Sort by size and take the largest that looks like revenue
            sorted_numbers = sorted(set(doc_numbers), reverse=True)
            
            # Look for revenue query context
            if any(word in query.lower() for word in ["revenue", "income", "sales"]):
                # Take the largest number that's likely revenue (> $100K)
                base_value = next((n for n in sorted_numbers if n >= 100000), sorted_numbers[0])
            else:
                # For other queries, take the largest relevant number
                base_value = sorted_numbers[0]
        
        # Determine change amount from query
        change_amount = None
        if query_numbers and not change_percentage:
            # Look for absolute amounts in query
            change_amount = max(query_numbers) if query_numbers else None
        
        return SimulationParameters(
            base_value=base_value,
            change_percentage=change_percentage,
            change_amount=change_amount,
            scenario_description=f"Scenario: {query}",
            variables={
                "extracted_query_numbers": query_numbers,
                "extracted_doc_numbers": doc_numbers[:5],  # Limit to first 5
                "operation": operation
            },
        )
    
    def _calculate_projection(
        self, 
        parameters: SimulationParameters, 
        operation: str = "increase"
    ) -> SimulationResult:
        """Calculate projection based on parameters."""
        
        base_value = parameters.get("base_value", 0)
        change_percentage = parameters.get("change_percentage")
        change_amount = parameters.get("change_amount")
        
        if base_value is None:
            base_value = 0
        
        # Calculate projected value
        projected_value = base_value
        methodology = "Direct calculation"
        
        try:
            if change_percentage is not None:
                if operation == "increase":
                    projected_value = base_value * (1 + change_percentage / 100)
                    methodology = f"Applied {change_percentage}% increase"
                elif operation == "decrease":
                    projected_value = base_value * (1 - change_percentage / 100)
                    methodology = f"Applied {change_percentage}% decrease"
                elif operation == "multiply":
                    projected_value = base_value * (change_percentage / 100)
                    methodology = f"Multiplied by {change_percentage/100}"
            
            elif change_amount is not None:
                if operation in ["increase", "add"]:
                    projected_value = base_value + change_amount
                    methodology = f"Added {change_amount}"
                elif operation in ["decrease", "subtract"]:
                    projected_value = base_value - change_amount
                    methodology = f"Subtracted {change_amount}"
            
            # Calculate differences
            change_amt = projected_value - base_value
            change_pct = (change_amt / base_value * 100) if base_value != 0 else 0
            
            return SimulationResult(
                current_value=base_value,
                projected_value=projected_value,
                change_amount=change_amt,
                change_percentage=change_pct,
                assumptions=[
                    f"Base value: {base_value}",
                    f"Operation: {operation}",
                    "Linear scaling applied",
                    "No external factors considered"
                ],
                methodology=methodology
            )
            
        except Exception as e:
            # Return error scenario
            return SimulationResult(
                current_value=base_value,
                projected_value=base_value,
                change_amount=0,
                change_percentage=0,
                assumptions=[f"Calculation error: {str(e)}"],
                methodology="Fallback calculation"
            )
    
    async def generate_simulation(
        self,
        query: str,
        chunks: List[DocumentChunk],
        classification: QueryClassification,
        enable_tracing: bool = True
    ) -> tuple[SimulationResult, SimulationParameters]:
        """
        Generate counterfactual simulation with quantitative projections.
        
        Args:
            query: User's counterfactual question
            chunks: Retrieved document chunks with baseline data
            classification: Query classification
            enable_tracing: Whether to track execution time
            
        Returns:
            Tuple of (simulation result, extracted parameters)
        """
        start_time = datetime.now() if enable_tracing else None
        
        try:
            # Step 1: Extract parameters from query and documents
            if self.extraction_chain:
                # Use LLM for parameter extraction
                context = self._format_context(chunks)
                extraction_result = await self.extraction_chain.ainvoke({
                    "query": query,
                    "context": context
                })
                
                parameters = SimulationParameters(
                    base_value=extraction_result.get("base_value"),
                    change_percentage=extraction_result.get("change_percentage"),
                    scenario_description=extraction_result.get("scenario_description", query),
                    variables=extraction_result.get("variables", {}),
                )
                operation = extraction_result.get("operation", "increase")
                
            else:
                # Fallback to rule-based extraction
                parameters = self._fallback_parameter_extraction(query, chunks)
                operation = "increase"  # Default operation
            
            # Step 2: Calculate projections
            if self.simulation_chain and parameters.get("base_value") is not None:
                # Use LLM for advanced calculations
                simulation_input = {
                    "base_value": parameters["base_value"],
                    "operation": operation,
                    "change_value": parameters.get("change_percentage") or parameters.get("change_amount"),
                    "scenario_description": parameters["scenario_description"]
                }
                
                simulation_result_raw = await self.simulation_chain.ainvoke(simulation_input)
                
                simulation_result = SimulationResult(
                    current_value=simulation_result_raw.get("current_value", parameters["base_value"]),
                    projected_value=simulation_result_raw.get("projected_value", parameters["base_value"]),
                    change_amount=simulation_result_raw.get("change_amount", 0),
                    change_percentage=simulation_result_raw.get("change_percentage", 0),
                    assumptions=simulation_result_raw.get("assumptions", []),
                    methodology=simulation_result_raw.get("methodology", "LLM calculation")
                )
            else:
                # Fallback calculation
                simulation_result = self._calculate_projection(parameters, operation)
            
            return simulation_result, parameters
            
        except Exception as e:
            print(f"Simulation Agent error: {e}")
            
            # Return error simulation
            fallback_params = self._fallback_parameter_extraction(query, chunks)
            fallback_result = self._calculate_projection(fallback_params)
            
            return fallback_result, fallback_params
    
    def _format_context(self, chunks: List[DocumentChunk]) -> str:
        """Format document chunks for parameter extraction."""
        if not chunks:
            return "No relevant documents found."
        
        formatted_chunks = []
        for i, chunk in enumerate(chunks, 1):
            formatted_chunks.append(
                f"[{i}] {chunk['filename']}\n{chunk['content']}\n"
            )
        
        return "\n".join(formatted_chunks)
    
    def create_trace(
        self,
        query: str,
        chunks: List[DocumentChunk],
        simulation_result: SimulationResult,
        parameters: SimulationParameters,
        start_time: datetime,
        error: str = None
    ) -> AgentTrace:
        """Create execution trace for this agent."""
        end_time = datetime.now()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)
        
        output_data = {
            "simulation_result": simulation_result,
            "parameters": parameters,
            "chunks_used": len(chunks)
        } if not error else None
        
        return AgentTrace(
            agent_name="simulation",
            start_time=start_time,
            end_time=end_time,
            input_data={
                "query": query,
                "chunks_count": len(chunks)
            },
            output_data=output_data,
            error=error,
            duration_ms=duration_ms
        )

# Global simulation agent instance
simulation_agent = SimulationAgent()