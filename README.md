# Agentic RAG Orchestrator

A production-ready multi-agent RAG (Retrieval-Augmented Generation) system that intelligently processes documents and provides contextually-aware responses using multiple specialized AI agents.

## 🚀 Features

- **Multi-Agent Architecture**: Router, Retriever, Reasoning, Simulation, Temporal, and General Knowledge agents
- **Intelligent Query Classification**: Automatically routes queries to the most appropriate agent
- **Document Processing**: PDF parsing, chunking, and embedding with Azure Cognitive Search
- **Real-time Chat Interface**: Modern React-based UI with streaming responses
- **Dual Database Support**: SQLite for development, PostgreSQL for production
- **Azure Integration**: Azure OpenAI and Azure Cognitive Search
- **Performance Optimized**: Database indexing, connection pooling, and efficient caching

## 🏗️ Architecture

```
Frontend (React + TypeScript)
├── Chat Interface
├── Document Upload
├── Context Panel
└── Settings Management

Backend Services
├── Express.js (Node.js API Server)
├── FastAPI (Python Agent Orchestrator)
├── SQLite/PostgreSQL Database
└── Azure Services Integration
```

## 📋 Prerequisites

- Node.js 18+ and npm
- Python 3.11+ and pip
- Azure OpenAI account
- Azure Cognitive Search service

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd PhaseOneBuild
   ```

2. **Install dependencies**
   ```bash
   # Install Node.js dependencies
   npm install
   
   # Install Python dependencies
   cd server
   pip install -r requirements.txt
   cd ..
   ```

3. **Configure environment**
   ```bash
   # Copy the example environment file
   cp .env.example .env
   
   # Edit .env with your Azure credentials
   ```

4. **Initialize the database**
   ```bash
   # Push database schema
   npm run db:push
   
   # Seed with sample data
   npm run db:seed
   ```

## ⚙️ Configuration

Update your `.env` file with the following required values:

```env
# Azure OpenAI Configuration
AZURE_OPENAI_API_KEY=your_azure_openai_key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME=text-embedding-3-large

# Azure Cognitive Search
AZURE_SEARCH_ENDPOINT=https://your-search.search.windows.net
AZURE_SEARCH_API_KEY=your_search_key
AZURE_SEARCH_INDEX_NAME=rag-documents

# Database (SQLite for development)
DB_TYPE=sqlite
DB_PATH=./data/local.sqlite
```

## 🚀 Running the Application

### Development Mode

1. **Start the backend services**
   ```bash
   # Terminal 1: Start Node.js API server
   npm run dev
   
   # Terminal 2: Start Python FastAPI server
   cd server
   uvicorn main:app --reload --port 8000
   ```

2. **Access the application**
   - Frontend: http://localhost:5000
   - Node.js API: http://localhost:5000/api
   - Python API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

### Production Mode

```bash
# Build the application
npm run build

# Start in production mode
npm start
```

## 📊 Database Commands

```bash
# Database schema management
npm run db:push      # Apply schema changes
npm run db:generate  # Generate migrations
npm run db:migrate   # Run migrations
npm run db:studio    # Open Drizzle Studio

# Data management
npm run db:seed      # Seed with sample data
npm run db:reset     # Reset database and reseed
```

## 🏗️ Agent System

The system uses multiple specialized agents:

- **Router Agent**: Classifies queries and routes to appropriate agents
- **Retriever Agent**: Searches and retrieves relevant document chunks
- **Reasoning Agent**: Handles analytical and logical queries
- **Simulation Agent**: Manages scenario-based and hypothetical questions
- **Temporal Agent**: Processes time-sensitive and historical queries
- **General Knowledge Agent**: Fallback for general questions

## 📁 Project Structure

```
PhaseOneBuild/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utilities and configurations
│   │   └── pages/          # Page components
├── server/                 # Python FastAPI backend
│   ├── agents/             # Multi-agent system
│   ├── api/                # API endpoints
│   └── services/           # Azure integrations
├── shared/                 # Shared TypeScript code
│   ├── db/                 # Database connection
│   └── schemas/            # Database schemas
├── migrations/             # Database migrations
└── database/               # Database utilities
```

## 🔍 API Endpoints

### Node.js API (Port 5000)
- `GET /api/health` - Health check
- `POST /api/documents/upload` - Upload documents
- `GET /api/documents` - List documents
- `POST /api/chat/sessions` - Create chat session
- `GET /api/chat/sessions/:id` - Get chat history

### Python API (Port 8000)
- `POST /api/query` - Process query with agents
- `POST /api/query/stream` - Stream query processing
- `GET /api/health` - Health check
- `GET /docs` - API documentation

## 🐛 Troubleshooting

### Common Issues

1. **Database connection errors**
   - Ensure database file permissions are correct
   - Check if the `data/` directory exists

2. **Azure API errors**
   - Verify your API keys are correct
   - Check Azure service quotas and limits
   - Ensure deployments are active

3. **Python dependency conflicts**
   - Use a virtual environment
   - Update pip: `python -m pip install --upgrade pip`

### Debug Mode

Enable debug logging by setting:
```env
LOG_LEVEL=debug
DEBUG_DB=true
ENABLE_QUERY_LOGGING=true
```

## 📈 Performance

- **Database Indexing**: Optimized indexes for common query patterns
- **Connection Pooling**: Efficient database connection management
- **Streaming Responses**: Real-time response streaming for better UX
- **Caching**: LangChain built-in caching for repeated queries

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For questions and support:
- Check the troubleshooting section
- Review the API documentation at `/docs`
- Open an issue in the repository