<div align="center">

# 🤖 AI Document Intelligence Platform

**Multi-Agent RAG System for Intelligent Document Q&A**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![LangChain](https://img.shields.io/badge/🦜_LangChain-1C3C3C?style=flat)](https://www.langchain.com/)
[![Azure](https://img.shields.io/badge/Azure-0078D4?style=flat&logo=microsoft-azure&logoColor=white)](https://azure.microsoft.com/)

<img width="2558" alt="AI Document Intelligence Platform" src="https://github.com/user-attachments/assets/470e597b-db38-4734-b9d7-dc14973afca8" />

*Upload documents. Ask questions. Get AI-powered answers with full transparency.*

[Features](#-features) • [Architecture](#-architecture) • [Quick Start](#-quick-start) • [Tech Stack](#-tech-stack)

</div>

---

## ✨ Features

### 🎯 Core Capabilities
- **🧠 Multi-Agent AI System** - 10+ specialized agents orchestrated with LangGraph
- **📚 Universal Document Processing** - PDF, DOCX, XLSX, CSV, TXT, Markdown, HTML, JSON
- **💬 Real-Time Streaming Chat** - Server-Sent Events for responsive UX
- **🔍 Hybrid Vector Search** - Semantic + keyword search with Azure Cognitive Search
- **🎨 Refined Questions** - AI suggests intelligent follow-up questions
- **📊 Full Transparency** - Agent execution traces and cost tracking
- **🔐 Enterprise Security** - JWT auth, user isolation, quota management
- **💾 Dual Database** - SQLite (dev) + PostgreSQL (prod)

### 🤖 Intelligent Agents
```
Intent Router → Query Classifier → Document Retrieval → Reasoning
     ↓               ↓                    ↓                ↓
Temporal      Simulation         Memory Manager    Error Handler
     ↓               ↓                    ↓                ↓
Meta Knowledge  Cost Tracker      Title Generator   General Knowledge
```

### 🎨 User Experience
- **Drag & drop document upload** with progress tracking
- **Streaming responses** with citations to source material
- **Context panel** showing agent reasoning and sources
- **Multi-session support** with automatic title generation
- **Personal API keys** for unlimited usage
- **Mobile-responsive** design with dark/light mode

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         🌐 FRONTEND                             │
│                  React 18 + TypeScript + Vite                   │
│                         Port 5000                               │
├─────────────────────────────────────────────────────────────────┤
│  • Chat Interface with streaming responses                      │
│  • Document management (upload, view, delete)                   │
│  • Settings & configuration (models, quotas, keys)              │
│  • Real-time SSE connection for agent updates                   │
│  • Clerk authentication with JWT                                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                   HTTP/REST + SSE
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                      ⚙️ BACKEND LAYER                           │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │          📦 Node.js Express API (Port 5000)              │  │
│  │  • Authentication middleware (Clerk JWT validation)      │  │
│  │  • Session management & user context                     │  │
│  │  • Document upload & metadata storage                    │  │
│  │  • API gateway to Python services                        │  │
│  │  • Database operations (Drizzle ORM)                     │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                         │
│                  Proxy Requests                                 │
│                       │                                         │
│  ┌────────────────────▼─────────────────────────────────────┐  │
│  │        🐍 Python FastAPI + LangGraph (Port 8000)         │  │
│  │  • Multi-agent orchestration (LangGraph StateGraph)      │  │
│  │  • Intent routing & query classification                 │  │
│  │  • Document processing pipeline (PyMuPDF, python-docx)   │  │
│  │  • Vector embeddings & hybrid search                     │  │
│  │  • RAG chain with citation extraction                    │  │
│  │  • Streaming response generation                         │  │
│  │  • Cost tracking & quota enforcement                     │  │
│  └────────────────────┬─────────────────────────────────────┘  │
└────────────────────────┼──────────────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              │                     │
    ┌─────────▼────────┐  ┌─────────▼──────────┐
    │   💾 Database    │  │   🔍 Vector Store  │
    │                  │  │                    │
    │  PostgreSQL      │  │  Azure Cognitive   │
    │  (Production)    │  │  Search            │
    │       or         │  │                    │
    │  SQLite (Dev)    │  │  • Vector index    │
    │                  │  │  • Hybrid search   │
    │  • User data     │  │  • Metadata filter │
    │  • Documents     │  │  • User isolation  │
    │  • Chat history  │  │                    │
    │  • Configurations│  │                    │
    └──────────────────┘  └──────────┬─────────┘
                                     │
                            ┌────────▼─────────┐
                            │   🤖 Azure AI    │
                            │                  │
                            │  Azure OpenAI    │
                            │  • GPT-4o        │
                            │  • Embeddings    │
                            │  • Streaming     │
                            └──────────────────┘
```

### 📊 Data Flow Example

**User Query: "What were the Q3 revenue numbers?"**

1. **Frontend** → User types question → Opens SSE connection
2. **Express** → Validates JWT → Forwards with `x-user-id` header
3. **FastAPI** → Checks quota → Decrements atomically
4. **Intent Router** → Classifies as `RAG` query
5. **Query Refinement** → Generates 3 follow-up questions → Streams to frontend
6. **Retriever** → Searches Azure Cognitive Search → Returns top 5 chunks
7. **Reasoning Agent** → Synthesizes answer with citations → Streams response
8. **Frontend** → Displays answer + sources + agent traces
9. **Title Generator** → Creates session title → Updates UI

**⚡ Total Time: ~3-5 seconds | User sees response word-by-word in real-time**

---

## 🚀 Quick Start

### Prerequisites

```bash
Node.js 18+  |  Python 3.11+  |  npm/pip
Azure OpenAI API  |  Azure Cognitive Search
```

### 1️⃣ Clone & Install

```bash
# Clone repository
git clone https://github.com/udit0x/agentic-rag.git
cd PhaseOneBuild

# Install Node dependencies
npm install

# Install Python dependencies
cd server
pip install -r requirements.txt
cd ..
```

### 2️⃣ Environment Setup

Create `.env` file in the root:

```env
# Azure OpenAI
AZURE_OPENAI_API_KEY=your_key_here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME=text-embedding-3-large

# Azure Cognitive Search
AZURE_SEARCH_ENDPOINT=https://your-search.search.windows.net
AZURE_SEARCH_API_KEY=your_key_here
AZURE_SEARCH_INDEX_NAME=rag-documents

# Clerk Authentication
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx

# Database (SQLite for development)
DB_TYPE=sqlite
DB_PATH=./data/local.sqlite

# Optional: PostgreSQL for production
# DB_TYPE=postgresql
# DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
```

### 3️⃣ Initialize Database

```bash
# Create schema
npm run db:push

# Optional: Seed with sample data
npm run db:seed
```

### 4️⃣ Start Development Servers

**Option A: Separate Terminals**
```bash
# Terminal 1: Frontend + Node.js API
npm run dev

# Terminal 2: Python FastAPI
cd server
uvicorn main:app --reload --port 8000
```

**Option B: Single Command** (Windows)
```powershell
.\start-dev.bat
```

**Option B: Single Command** (Linux/Mac)
```bash
chmod +x start-dev.sh
./start-dev.sh
```

### 5️⃣ Access Application

- 🌐 **Frontend**: http://localhost:5000
- 📡 **Node API**: http://localhost:5000/api
- 🐍 **Python API**: http://localhost:8000
- 📚 **API Docs**: http://localhost:8000/docs

---

## 🛠️ Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework |
| **TypeScript** | Type safety |
| **Vite** | Build tool & dev server |
| **Tailwind CSS** | Utility-first styling |
| **shadcn/ui** | Component library (Radix UI) |
| **Zustand** | State management |
| **TanStack Query** | Server state & caching |
| **Clerk** | Authentication |
| **Framer Motion** | Animations |
| **Wouter** | Routing |

### Backend - Node.js
| Technology | Purpose |
|------------|---------|
| **Express.js** | HTTP server |
| **Drizzle ORM** | Database toolkit |
| **better-sqlite3** | SQLite driver (dev) |
| **pg** | PostgreSQL driver (prod) |
| **Clerk SDK** | JWT validation |
| **ws** | WebSocket support |

### Backend - Python
| Technology | Purpose |
|------------|---------|
| **FastAPI** | Async web framework |
| **LangChain** | LLM orchestration framework |
| **LangGraph** | Multi-agent state management |
| **Azure OpenAI SDK** | GPT-4o & embeddings |
| **Azure Search SDK** | Vector & hybrid search |
| **PyMuPDF** | PDF parsing |
| **python-docx** | Word document parsing |
| **pandas** | Excel/CSV processing |
| **asyncpg** | Async PostgreSQL |

### Infrastructure
| Service | Purpose |
|---------|---------|
| **Azure OpenAI** | GPT-4o, text-embedding-3-large |
| **Azure Cognitive Search** | Vector database & hybrid search |
| **Azure Document Intelligence** | OCR for scanned PDFs |
| **Clerk** | Authentication & user management |
| **PostgreSQL** | Production database |

---

## 📂 Project Structure

```
PhaseOneBuild/
├── 📱 client/                       # React frontend
│   ├── public/                      # Static assets
│   └── src/
│       ├── components/              # UI components
│       │   ├── auth/                # Authentication components
│       │   ├── chat/                # Chat interface
│       │   ├── documents/           # Document management
│       │   ├── settings/            # Settings panels
│       │   ├── ui/                  # shadcn/ui components
│       │   └── upload/              # Upload components
│       ├── contexts/                # React contexts
│       ├── hooks/                   # Custom React hooks
│       ├── lib/                     # Utilities & config
│       ├── pages/                   # Route components
│       ├── stores/                  # Zustand stores
│       ├── App.tsx                  # Root component
│       └── main.tsx                 # Entry point
│
├── 🐍 server/                       # Python FastAPI backend
│   ├── agents/                      # Multi-agent system
│   │   ├── intent_router.py         # Query classification
│   │   ├── retriever.py             # Document retrieval
│   │   ├── reasoning.py             # Answer synthesis
│   │   ├── query_refinement.py      # Follow-up questions
│   │   ├── temporal.py              # Time-based queries
│   │   ├── simulation.py            # Scenario analysis
│   │   ├── memory_manager.py        # Conversation memory
│   │   ├── cost_tracker.py          # Usage tracking
│   │   ├── title_generator.py       # Session titles
│   │   ├── orchestrator.py          # LangGraph workflow
│   │   └── state.py                 # Shared state
│   ├── api/                         # API routes
│   ├── azure_client.py              # Azure service clients
│   ├── document_processor.py        # File parsing
│   ├── database_postgresql.py       # PostgreSQL interface
│   ├── database_sqlite.py           # SQLite interface
│   ├── config_manager.py            # Configuration handling
│   ├── quota_middleware.py          # Quota enforcement
│   ├── main.py                      # FastAPI app
│   └── requirements.txt             # Python dependencies
│
├── 📦 shared/                       # Shared code
│   ├── db/                          # Database connection
│   │   ├── index.ts                 # DB client
│   │   └── pool.ts                  # Connection pooling
│   └── schemas/                     # Drizzle schemas
│       ├── users.ts
│       ├── documents.ts
│       ├── sessions.ts
│       ├── messages.ts
│       └── configurations.ts
│
├── 🗄️ database/                     # Database utilities
│   ├── indexes-postgresql.sql       # PostgreSQL indexes
│   ├── optimize-postgresql.sql      # Query optimization
│   └── seed-simple.ts               # Seed script
│
├── 🔄 migrations/                   # Database migrations
│   ├── postgresql/                  # PostgreSQL migrations
│   └── sqlite/                      # SQLite migrations
│
├── ⚙️ Configuration Files
│   ├── package.json                 # Node dependencies
│   ├── tsconfig.json                # TypeScript config
│   ├── vite.config.ts               # Vite config
│   ├── tailwind.config.ts           # Tailwind config
│   ├── drizzle.config.ts            # Drizzle ORM config
│   ├── pyproject.toml               # Python project config
│   └── docker-compose.yml           # Docker setup
│
└── 📚 Documentation
    ├── README.md                    # This file
    ├── PRODUCT_OVERVIEW.md          # Product details
    ├── DEPLOYMENT_READY.md          # Deployment guide
    └── azure/                       # Azure deployment docs
```

---

## 📊 Database Commands

```bash
# Schema Management
npm run db:push          # Push schema changes to database
npm run db:generate      # Generate migration files
npm run db:migrate       # Run pending migrations
npm run db:studio        # Open Drizzle Studio (GUI)
npm run db:check         # Validate schema

# Data Management
npm run db:seed          # Seed with sample data
npm run db:reset         # Drop all, push schema, reseed

# Development
npm run db:introspect    # Generate schema from existing DB
```

---

## 🔌 API Reference

### Node.js Express API (Port 5000)

#### Health & Info
- `GET /api/health` - Server health check
- `GET /api/user` - Get authenticated user info

#### Documents
- `POST /api/documents/upload` - Upload document (multipart/form-data)
- `GET /api/documents` - List user's documents
- `GET /api/documents/:id` - Get document details
- `DELETE /api/documents/:id` - Delete document

#### Chat Sessions
- `POST /api/chat/sessions` - Create new chat session
- `GET /api/chat/sessions` - List user's sessions
- `GET /api/chat/sessions/:id` - Get session with messages
- `PATCH /api/chat/sessions/:id` - Update session title
- `DELETE /api/chat/sessions/:id` - Delete session

#### Configurations
- `GET /api/configurations` - Get user's config
- `POST /api/configurations` - Create/update config
- `PATCH /api/configurations/:id` - Partial update

### Python FastAPI API (Port 8000)

#### Query Processing
- `POST /api/query` - Process query (returns complete response)
- `POST /api/query/stream` - Process query with streaming (SSE)

**Request Body:**
```json
{
  "query": "What were the Q3 revenue numbers?",
  "session_id": "uuid",
  "user_id": "clerk_user_id",
  "document_ids": ["doc_id_1", "doc_id_2"],
  "config": {
    "model": "gpt-4o",
    "temperature": 0.7
  }
}
```

**SSE Events:**
- `refined_questions` - Follow-up question suggestions
- `data` - Streamed response chunks
- `sources` - Retrieved document sources
- `agent_trace` - Agent execution details
- `title_update` - Generated session title
- `error` - Error information

#### Health
- `GET /api/health` - Service health check
- `GET /docs` - Interactive API documentation (Swagger UI)

---

## 🐛 Development Tips

### Debugging

Enable verbose logging:
```env
LOG_LEVEL=debug
DEBUG_DB=true
ENABLE_QUERY_LOGGING=true
```

View database:
```bash
npm run db:studio
# Opens Drizzle Studio at http://localhost:4983
```

Monitor Python logs:
```bash
cd server
uvicorn main:app --reload --log-level debug
```

### Common Issues

**Issue: Azure API 429 errors**
- Check quota limits in Azure Portal
- Implement rate limiting in code
- Use personal keys for development

**Issue: Database locked (SQLite)**
- Close all connections in Drizzle Studio
- Restart development servers
- Switch to PostgreSQL for production

**Issue: CORS errors**
- Verify `VITE_API_URL` matches backend URL
- Check Express CORS configuration
- Ensure credentials are included in requests

**Issue: Agent not responding**
- Check Azure OpenAI deployment status
- Verify API keys are correct
- Review FastAPI logs for errors

---

## 🧪 Testing

```bash
# Type checking
npm run check

# Run unit tests (when available)
npm run test

# Test document upload
curl -X POST http://localhost:5000/api/documents/upload \
  -H "Authorization: Bearer YOUR_JWT" \
  -F "file=@document.pdf"

# Test query endpoint
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -H "x-user-id: user_123" \
  -d '{"query": "What is this about?", "session_id": "uuid"}'
```

---

## 📈 Performance Optimization

### Database
- ✅ Composite indexes on frequently queried columns
- ✅ Connection pooling (pg-pool for PostgreSQL)
- ✅ Prepared statements via Drizzle ORM
- ✅ Optimized queries with `EXPLAIN ANALYZE`

### Caching
- ✅ LangChain semantic cache for repeated queries
- ✅ TanStack Query for frontend data caching
- ✅ Azure Search result caching

### Streaming
- ✅ Server-Sent Events for real-time updates
- ✅ Chunked response generation
- ✅ Progressive UI rendering

---

## 🔐 Security

### Authentication
- ✅ Clerk JWT validation on all requests
- ✅ User ID extracted from verified token
- ✅ No client-side spoofing possible

### Authorization
- ✅ Row-level security (user_id filtering)
- ✅ Ownership verification on mutations
- ✅ No cross-user data access

### Data Protection
- ✅ API keys encrypted with Fernet
- ✅ SQL injection prevention (parameterized queries)
- ✅ XSS protection (sanitized outputs)

---

## 📝 License

This project is licensed under the MIT License.

---

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines and code of conduct.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

<div align="center">

**Built with ❤️ using React, FastAPI, LangChain, and Azure AI**

[⬆ Back to Top](#-ai-document-intelligence-platform)

</div>
