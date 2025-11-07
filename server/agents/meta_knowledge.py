"""Meta Knowledge Agent for handling questions about the application itself."""

from typing import Dict, Any, Optional
from datetime import datetime


class MetaKnowledgeAgent:
    """Agent that provides information about the application's capabilities and features."""
    
    def __init__(self):
        self.name = "meta_knowledge"
        self.app_info = self._build_application_knowledge()
    
    def _build_application_knowledge(self) -> Dict[str, Any]:
        """Build comprehensive knowledge about the application."""
        return {
            "name": "Intelligent Document Q&A System",
            "type": "Agentic RAG (Retrieval-Augmented Generation)",
            "purpose": "AI-powered document analysis and question-answering system",
            
            "core_capabilities": [
                "🔍 **Document Analysis**: Upload and analyze PDF documents, reports, and text files",
                "💬 **Intelligent Q&A**: Ask questions about your uploaded documents and get accurate answers",
                "🧠 **Context-Aware Conversations**: Maintains conversation history and understands follow-up questions",
                "📊 **Multi-Modal Analysis**: Handles factual questions, counterfactual scenarios, and temporal analysis",
                "🔗 **Source Citations**: Provides references to specific document sections for every answer",
                "⚡ **Smart Routing**: Automatically determines the best approach for each type of question"
            ],
            
            "question_types": {
                "factual": "Direct questions about information in your documents (e.g., 'What is the revenue for Q3?')",
                "counterfactual": "What-if scenarios and hypothetical analysis (e.g., 'What if sales increased by 20%?')",
                "temporal": "Questions about how information has changed over time (e.g., 'How has the strategy evolved?')",
                "conversational": "Follow-up questions and clarifications based on previous responses"
            },
            
            "key_features": [
                "📂 **Document Management**: Upload, view, and delete your documents",
                "🎯 **Intelligent Intent Detection**: Automatically understands what type of answer you need",
                "🔄 **Multi-Agent Workflow**: Uses specialized AI agents for different types of analysis",
                "📱 **Responsive Design**: Works seamlessly on desktop and mobile devices",
                "⚙️ **Customizable Settings**: Configure AI models, Document Threshold, and other parameters",
                "🎨 **Modern UI**: Clean, intuitive interface with real-time animations"
            ],
            
            "how_it_works": [
                "**Upload Documents**: Add your PDF files or documents to the system",
                "**Ask Questions**: Type any question about your documents in natural language",
                "**AI Processing**: The system analyzes your question and retrieves relevant information",
                "**Get Answers**: Receive detailed responses with source citations and references",
                "**Continue Conversation**: Ask follow-up questions or explore different aspects"
            ],
            
            "agent_system": {
                "Intent Router": "Determines the best approach for each question",
                "Document Retriever": "Finds relevant information from your uploaded documents",
                "Reasoning Agent": "Provides factual analysis and detailed explanations",
                "Simulation Agent": "Handles what-if scenarios and counterfactual analysis",
                "Temporal Agent": "Analyzes how information has changed over time",
                "Conversation Memory": "Maintains context and handles follow-up questions"
            },
            
            "use_cases": [
                "📋 **Business Reports**: Analyze financial reports, quarterly statements, and business documents",
                "📚 **Research Papers**: Get insights from academic papers and research documents",
                "📖 **Technical Documentation**: Query technical manuals, specifications, and guides",
                "💼 **Legal Documents**: Analyze contracts, policies, and legal texts",
                "📊 **Data Analysis**: Explore trends and patterns in data-heavy documents"
            ],
            
            "getting_started": [
                "Click the '↑' button to upload your first document",
                "Wait for the document to be processed and indexed",
                "Start asking questions about the content",
                "Use follow-up questions to dive deeper into topics",
                "Check the context panel (desktop) to see sources and analysis details"
            ]
        }
    
    async def handle_meta_query(
        self, 
        query: str, 
        session_id: Optional[str] = None,
        enable_tracing: bool = True
    ) -> Dict[str, Any]:
        """
        Handle meta questions about the application.
        
        Args:
            query: User's meta question
            session_id: Session ID for context
            enable_tracing: Whether to track execution time
            
        Returns:
            Response with application information
        """
        start_time = datetime.now() if enable_tracing else None
        
        query_lower = query.lower()
        
        # Determine what aspect of the application to explain
        if any(phrase in query_lower for phrase in ["what can you do", "capabilities", "what do you do"]):
            response = self._get_capabilities_overview()
        elif any(phrase in query_lower for phrase in ["how does this work", "how do you work", "how it works"]):
            response = self._get_how_it_works()
        elif any(phrase in query_lower for phrase in ["what is this", "what are you", "tell me about"]):
            response = self._get_application_overview()
        elif any(phrase in query_lower for phrase in ["features", "what features"]):
            response = self._get_features_overview()
        elif any(phrase in query_lower for phrase in ["help", "how to use", "getting started"]):
            response = self._get_getting_started()
        elif any(phrase in query_lower for phrase in ["question types", "what kind of questions"]):
            response = self._get_question_types()
        else:
            # General overview for other meta questions
            response = self._get_general_overview()
        
        execution_time = None
        if enable_tracing and start_time:
            execution_time = (datetime.now() - start_time).total_seconds() * 1000
        
        return {
            "response": response,
            "response_type": "meta",
            "execution_time_ms": execution_time,
            "sources": [],  # No document sources for meta responses
            "agent_name": self.name
        }
    
    def _get_capabilities_overview(self) -> str:
        """Get overview of application capabilities."""
        capabilities = self.app_info["core_capabilities"]
        return f"""## 🚀 What I Can Do

I'm an **Intelligent Document Q&A System** powered by AI. Here are my key capabilities:

{chr(10).join(capabilities)}

### 🎯 Question Types I Handle:
- **Factual Questions**: Direct information from your documents
- **What-If Scenarios**: Hypothetical analysis and projections  
- **Temporal Analysis**: How information has evolved over time
- **Follow-up Questions**: Context-aware conversations

### 💡 Smart Features:
- Automatic source citations for every answer
- Context-aware conversation memory
- Multi-agent AI workflow for optimal responses
- Real-time document processing and indexing

**Ready to get started?** Upload a document and ask me anything about it! 📄✨"""
    
    def _get_how_it_works(self) -> str:
        """Explain how the application works."""
        steps = self.app_info["how_it_works"]
        agents = self.app_info["agent_system"]
        
        workflow_steps = "\n".join([f"**{step}**" for step in steps])
        agent_descriptions = "\n".join([f"- **{name}**: {desc}" for name, desc in agents.items()])
        
        return f"""## ⚙️ How This System Works

### 🔄 Workflow Process:
{workflow_steps}

### 🤖 AI Agent System:
Behind the scenes, I use multiple specialized AI agents working together:

{agent_descriptions}

### 🧠 Intelligence Features:
- **Smart Intent Detection**: I automatically understand what type of answer you need
- **Context Awareness**: I remember our conversation and understand follow-up questions
- **Source Attribution**: Every answer includes references to specific document sections
- **Adaptive Routing**: Different question types get routed to specialized agents for optimal results

This multi-agent approach ensures you get the most accurate and relevant answers possible! 🎯"""
    
    def _get_application_overview(self) -> str:
        """Get general application overview."""
        return f"""## 📋 About This Application

**{self.app_info["name"]}** - {self.app_info["purpose"]}

I'm an advanced **{self.app_info["type"]}** system designed to help you extract insights from your documents through natural language conversations.

### 🎯 My Purpose:
Transform how you interact with your documents by providing:
- Instant answers to questions about your content
- Intelligent analysis and insights
- Context-aware conversations
- Accurate source citations

### 🌟 What Makes Me Special:
- **Multi-Agent AI**: Specialized agents handle different types of questions
- **Context Awareness**: I understand follow-up questions and conversation flow
- **Source Attribution**: Every answer shows you exactly where the information comes from
- **Flexible Analysis**: Handle everything from simple facts to complex scenarios

### 🚀 Perfect For:
- Business professionals analyzing reports
- Researchers exploring academic papers  
- Students studying documents
- Anyone who needs quick insights from text documents

Ready to explore your documents with AI-powered intelligence? Let's get started! 💫"""
    
    def _get_features_overview(self) -> str:
        """Get overview of key features."""
        features = self.app_info["key_features"]
        use_cases = self.app_info["use_cases"]
        
        feature_list = "\n".join(features)
        use_case_list = "\n".join(use_cases)
        
        return f"""## ✨ Key Features

{feature_list}

### 🎯 Common Use Cases:

{use_case_list}

### 🔧 Advanced Capabilities:
- **Intelligent Caching**: Reuses previous results when appropriate
- **Error Handling**: Graceful handling of API issues and edge cases  
- **Performance Optimization**: Fast response times with smart indexing
- **Security**: Your documents are processed securely and privately

**Experience the power of AI-driven document analysis!** 🚀"""
    
    def _get_getting_started(self) -> str:
        """Get getting started guide."""
        steps = self.app_info["getting_started"]
        step_list = "\n".join([f"{i}. {step}" for i, step in enumerate(steps, 1)])
        
        return f"""## 🚀 Getting Started Guide

Welcome! Here's how to start using the system:

### 📝 Quick Start:
{step_list}

### 💡 Pro Tips:
- **Be Specific**: More detailed questions get better answers
- **Ask Follow-ups**: I remember our conversation context
- **Check Sources**: Click on citations to see exactly where information comes from
- **Try Different Question Types**: Ask for summaries, comparisons, or what-if scenarios

### 📱 Interface Tips:
- **Desktop**: Use the context panel on the right to see analysis details
- **Mobile**: Swipe or tap to navigate between sections
- **Search**: Use the search box in the sidebar to find previous conversations

### ❓ Example Questions to Try:
- "What are the key findings in this report?"
- "What if revenue increased by 15%?"
- "How has the strategy changed over time?"
- "Can you summarize the main conclusions?"

**Ready to dive in?** Upload your first document and let's explore together! 🎯"""
    
    def _get_question_types(self) -> str:
        """Explain different question types."""
        question_types = self.app_info["question_types"]
        
        type_descriptions = "\n".join([
            f"### {qtype.title()} Questions\n{desc}\n" 
            for qtype, desc in question_types.items()
        ])
        
        return f"""## 🎯 Question Types I Handle

I'm designed to handle various types of questions about your documents:

{type_descriptions}

### 📊 Advanced Analysis:
- **Comparative Analysis**: "How do Q1 and Q2 results compare?"
- **Trend Analysis**: "What trends are visible in the data?"
- **Summary Requests**: "Can you summarize the key points?"
- **Detail Exploration**: "Tell me more about the methodology"

### 💬 Conversation Features:
- **Context Awareness**: I remember what we've discussed
- **Follow-up Questions**: "What about the other metrics?"
- **Clarification Requests**: "Can you explain that in simpler terms?"
- **Reference Questions**: "You mentioned X earlier, can you elaborate?"

**The key is to ask naturally!** I understand context and can handle complex, multi-part questions. 🧠✨"""
    
    def _get_general_overview(self) -> str:
        """Get general overview for other meta questions."""
        return f"""## 🤖 AI-Powered Document Intelligence

I'm your **Intelligent Document Q&A Assistant** - an advanced AI system designed to help you understand and analyze your documents through natural conversation.

### 🎯 What I Do:
- Answer questions about your uploaded documents
- Provide context-aware analysis and insights  
- Handle everything from simple facts to complex scenarios
- Remember our conversation for natural follow-ups

### 🚀 How I Help:
- **Save Time**: Get instant answers instead of searching through documents
- **Gain Insights**: Discover patterns and insights you might miss
- **Explore Ideas**: Ask what-if questions and explore scenarios
- **Stay Organized**: Keep track of your document conversations

### 💡 Getting Started:
1. Upload your documents (PDF, text files)
2. Ask any question about the content
3. Continue the conversation with follow-ups
4. Explore different aspects and scenarios

**I'm here to make your documents more accessible and insights more discoverable!** 

What would you like to know about your documents? 📄✨"""


# Global meta knowledge agent instance
meta_knowledge_agent = MetaKnowledgeAgent()