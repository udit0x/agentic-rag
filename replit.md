# RAG Orchestrator - Multi-Agent Document Intelligence

## Project Overview
A production-ready, open-source RAG (Retrieval-Augmented Generation) system with multi-agent orchestration, specialized reasoning modes, and temporal awareness. Built with Azure OpenAI integration for embeddings and language model capabilities.

## Architecture

### Phase 1: Foundation (Current)
**Backend**: FastAPI with async/await patterns
- Azure OpenAI client for GPT-4o and text-embedding-3-large
- Document ingestion pipeline (PDF/TXT support)
- Embedding generation with batching
- Azure Cognitive Search vector store
- Basic retrieval with semantic search

**Frontend**: React with TypeScript
- ChatGPT-inspired interface with message bubbles
- Two-pane layout (chat + context panel)
- Document upload with drag-and-drop
- Markdown rendering with syntax highlighting
- Dark/light theme support
- Responsive design (mobile + desktop)

### Technology Stack

**Frontend**:
- React 18 with TypeScript
- Wouter for routing
- TanStack Query for server state
- Tailwind CSS + ShadCN UI components
- React Markdown with syntax highlighting
- Framer Motion for animations

**Backend** (Phase 2):
- FastAPI with Python 3.10+
- LangChain & LangChain-OpenAI
- LangGraph for agent orchestration
- Azure OpenAI SDK
- Azure Cognitive Search SDK
- PyPDF2/pypdf for PDF parsing
- Pydantic v2 for validation

**Infrastructure**:
- In-memory storage for Phase 1 (PostgreSQL in later phases)
- Azure OpenAI for embeddings and LLM
- Azure Cognitive Search for vector storage
- Local file storage in `/data` directory

## Data Model

### Documents
- `id`: Unique identifier
- `filename`: Original filename
- `contentType`: MIME type (application/pdf, text/plain)
- `size`: File size in bytes
- `content`: Full text content
- `uploadedAt`: Upload timestamp

### Document Chunks
- `id`: Unique identifier
- `documentId`: Reference to parent document
- `chunkIndex`: Sequential index
- `content`: Chunk text content
- `metadata`: JSON with page, section, character positions
- `embeddingId`: Reference to Azure Search vector
- `createdAt`: Creation timestamp

### Chat Sessions
- `id`: Unique identifier
- `title`: Optional session title
- `createdAt`: Creation timestamp
- `updatedAt`: Last activity timestamp

### Messages
- `id`: Unique identifier
- `sessionId`: Reference to chat session
- `role`: "user" or "assistant"
- `content`: Message text
- `sources`: Array of citation objects with document references
- `createdAt`: Creation timestamp

## API Endpoints (Phase 2 Implementation)

### Document Management
- `POST /api/documents/upload` - Upload and process document
- `GET /api/documents` - List all documents
- `DELETE /api/documents/:id` - Delete document

### Query & Chat
- `POST /api/query` - Ask question, get answer with citations
- `GET /api/chat/:sessionId` - Get chat history

## Design Guidelines
Follow `design_guidelines.md` for:
- Typography: Inter for UI, JetBrains Mono for code
- Spacing: Consistent 2-12 unit scale
- Components: ShadCN UI patterns
- Interactions: Subtle animations, hover states
- Accessibility: WCAG AA compliance

## Environment Variables
Required Azure credentials (stored in Replit Secrets):
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_DEPLOYMENT_NAME` (GPT-4o/GPT-4-Turbo)
- `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME` (text-embedding-3-large)
- `AZURE_SEARCH_ENDPOINT`
- `AZURE_SEARCH_API_KEY`
- `AZURE_SEARCH_INDEX_NAME`

## Future Phases

### Phase 2: Multi-Agent Routing
- LangGraph state management
- Router Agent for query classification
- Agent orchestration and handoffs
- Trace visualization in UI

### Phase 3: Simulation Mode
- Counterfactual reasoning agent
- "What-if" scenario projections
- Parameter extraction and calculations

### Phase 4: Temporal Mode
- Knowledge evolution detection
- Contradiction identification
- Timeline visualization

### Phase 5: Production Polish
- Performance optimization
- Comprehensive error handling
- Dark mode refinements
- Keyboard shortcuts

### Phase 6: Open Source Release
- Documentation
- Docker deployment
- Sample datasets
- Contributing guidelines

## Development Notes

### Current Status (Phase 1 Complete ✅)
- ✅ Complete data schema defined in `shared/schema.ts`
- ✅ All frontend components built with exceptional visual quality
- ✅ Theme system with dark/light mode toggle
- ✅ Responsive two-pane layout (chat + context panel)
- ✅ Document upload with drag-and-drop UI
- ✅ Message bubbles with markdown rendering and syntax highlighting
- ✅ Loading states with typing indicator
- ✅ Empty states with sample prompts
- ✅ Mock API for Phase 1 demonstration
- ✅ Backend infrastructure complete (FastAPI + Azure services)
- 📋 Phase 2: Backend integration and multi-agent orchestration

### Phase 1 Demo Notes
The frontend is fully functional with a mock API layer (`client/src/lib/mock-api.ts`) that simulates document uploads and queries. This allows users to experience the complete UI flow while backend integration is completed in Phase 2. All Azure credentials are configured and the backend code is ready for integration.

### Code Organization
- `shared/schema.ts` - TypeScript types and Zod schemas
- `client/src/components/` - Reusable React components
  - `chat/` - Message bubbles, input, typing indicator
  - `upload/` - Document upload with drag-and-drop
  - `context/` - Source citation panel
  - `layout/` - Header, theme toggle
- `client/src/pages/` - Route pages
- `server/` - Backend API (FastAPI)
- `server/storage.ts` - In-memory data storage interface

### Performance Targets
- Query response: < 3 seconds (excluding LLM latency)
- Document ingestion: < 5 seconds per MB
- UI interaction: < 100ms perceived responsiveness
- Support 10+ concurrent local users

## User Preferences
- Professional, clean aesthetic inspired by ChatGPT and Linear
- Focus on clarity and scannability over visual spectacle
- Subtle, purposeful animations only
- Generous spacing and typography hierarchy
- Accessibility-first approach
