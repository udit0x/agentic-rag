"""Azure OpenAI and Cognitive Search client configuration."""
import os
from typing import List, Dict, Any
from openai import AzureOpenAI
from langchain_openai import AzureOpenAIEmbeddings, AzureChatOpenAI
from langchain_core.documents import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchIndex,
    SearchField,
    SearchFieldDataType,
    VectorSearch,
    VectorSearchProfile,
    HnswAlgorithmConfiguration,
)

class AzureRAGClient:
    """Client for Azure OpenAI and Cognitive Search operations."""
    
    def __init__(self):
        # Azure OpenAI configuration
        self.api_key = os.getenv("AZURE_OPENAI_API_KEY")
        self.endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        self.deployment_name = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME")
        self.embedding_deployment = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME")
        
        # Azure Search configuration
        self.search_endpoint = os.getenv("AZURE_SEARCH_ENDPOINT")
        self.search_key = os.getenv("AZURE_SEARCH_API_KEY")
        self.index_name = os.getenv("AZURE_SEARCH_INDEX_NAME", "rag-documents")
        
        # Initialize clients
        self.client = AzureOpenAI(
            api_key=self.api_key,
            api_version="2024-02-01",
            azure_endpoint=self.endpoint
        )
        
        # LangChain embeddings
        self.embeddings = AzureOpenAIEmbeddings(
            azure_deployment=self.embedding_deployment,
            openai_api_version="2024-02-01",
            azure_endpoint=self.endpoint,
            api_key=self.api_key,
        )
        
        # LangChain LLM
        self.llm = AzureChatOpenAI(
            azure_deployment=self.deployment_name,
            openai_api_version="2024-02-01",
            azure_endpoint=self.endpoint,
            api_key=self.api_key,
            temperature=0.7,
        )
        
        # Azure Search clients
        self.search_index_client = SearchIndexClient(
            endpoint=self.search_endpoint,
            credential=AzureKeyCredential(self.search_key)
        )
        
        self.search_client = SearchClient(
            endpoint=self.search_endpoint,
            index_name=self.index_name,
            credential=AzureKeyCredential(self.search_key)
        )
        
        # Text splitter
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len,
        )
    
    async def ensure_index_exists(self):
        """Create search index if it doesn't exist."""
        try:
            self.search_index_client.get_index(self.index_name)
        except Exception:
            # Create index with vector search configuration
            fields = [
                SearchField(
                    name="id",
                    type=SearchFieldDataType.String,
                    key=True,
                    filterable=True,
                ),
                SearchField(
                    name="content",
                    type=SearchFieldDataType.String,
                    searchable=True,
                ),
                SearchField(
                    name="documentId",
                    type=SearchFieldDataType.String,
                    filterable=True,
                ),
                SearchField(
                    name="filename",
                    type=SearchFieldDataType.String,
                    filterable=True,
                ),
                SearchField(
                    name="chunkIndex",
                    type=SearchFieldDataType.Int32,
                    filterable=True,
                ),
                SearchField(
                    name="contentVector",
                    type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
                    searchable=True,
                    vector_search_dimensions=1536,
                    vector_search_profile_name="myHnswProfile",
                ),
            ]
            
            vector_search = VectorSearch(
                profiles=[
                    VectorSearchProfile(
                        name="myHnswProfile",
                        algorithm_configuration_name="myHnsw",
                    )
                ],
                algorithms=[
                    HnswAlgorithmConfiguration(name="myHnsw")
                ],
            )
            
            index = SearchIndex(
                name=self.index_name,
                fields=fields,
                vector_search=vector_search
            )
            
            self.search_index_client.create_index(index)
    
    async def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a list of texts."""
        return await self.embeddings.aembed_documents(texts)
    
    async def embed_query(self, text: str) -> List[float]:
        """Generate embedding for a single query."""
        return await self.embeddings.aembed_query(text)
    
    def split_text(self, text: str) -> List[str]:
        """Split text into chunks."""
        docs = self.text_splitter.create_documents([text])
        return [doc.page_content for doc in docs]
    
    async def upload_chunks_to_search(
        self, 
        chunks: List[Dict[str, Any]]
    ):
        """Upload document chunks with embeddings to Azure Cognitive Search."""
        await self.ensure_index_exists()
        
        # Prepare documents for upload
        documents = []
        for chunk in chunks:
            doc = {
                "id": chunk["id"],
                "content": chunk["content"],
                "documentId": chunk["documentId"],
                "filename": chunk["filename"],
                "chunkIndex": chunk["chunkIndex"],
                "contentVector": chunk["embedding"],
            }
            documents.append(doc)
        
        # Upload in batches
        self.search_client.upload_documents(documents=documents)
    
    async def semantic_search(
        self, 
        query: str, 
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """Perform semantic search using vector similarity."""
        # Generate query embedding
        query_vector = await self.embed_query(query)
        
        # Perform vector search
        results = self.search_client.search(
            search_text=query,
            vector_queries=[{
                "vector": query_vector,
                "k_nearest_neighbors": top_k,
                "fields": "contentVector",
            }],
            select=["id", "content", "documentId", "filename", "chunkIndex"],
            top=top_k
        )
        
        # Format results
        formatted_results = []
        for result in results:
            formatted_results.append({
                "id": result["id"],
                "content": result["content"],
                "documentId": result["documentId"],
                "filename": result["filename"],
                "chunkIndex": result["chunkIndex"],
                "score": result.get("@search.score", 0.0),
            })
        
        return formatted_results

# Global client instance
azure_client = AzureRAGClient()
