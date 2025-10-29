import {
  type Document,
  type InsertDocument,
  type DocumentChunk,
  type InsertDocumentChunk,
  type ChatSession,
  type InsertChatSession,
  type Message,
  type InsertMessage,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Document operations
  createDocument(document: InsertDocument): Promise<Document>;
  getDocument(id: string): Promise<Document | undefined>;
  getAllDocuments(): Promise<Document[]>;
  deleteDocument(id: string): Promise<void>;

  // Document chunk operations
  createDocumentChunk(chunk: InsertDocumentChunk): Promise<DocumentChunk>;
  getDocumentChunks(documentId: string): Promise<DocumentChunk[]>;
  getAllChunks(): Promise<DocumentChunk[]>;
  updateChunkEmbeddingId(chunkId: string, embeddingId: string): Promise<void>;

  // Chat session operations
  createChatSession(session: InsertChatSession): Promise<ChatSession>;
  getChatSession(id: string): Promise<ChatSession | undefined>;
  updateChatSessionTitle(id: string, title: string): Promise<void>;

  // Message operations
  createMessage(message: InsertMessage): Promise<Message>;
  getSessionMessages(sessionId: string): Promise<Message[]>;
}

export class MemStorage implements IStorage {
  private documents: Map<string, Document>;
  private documentChunks: Map<string, DocumentChunk>;
  private chatSessions: Map<string, ChatSession>;
  private messages: Map<string, Message>;

  constructor() {
    this.documents = new Map();
    this.documentChunks = new Map();
    this.chatSessions = new Map();
    this.messages = new Map();
  }

  // Document operations
  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const id = randomUUID();
    const document: Document = {
      ...insertDocument,
      id,
      uploadedAt: new Date(),
    };
    this.documents.set(id, document);
    return document;
  }

  async getDocument(id: string): Promise<Document | undefined> {
    return this.documents.get(id);
  }

  async getAllDocuments(): Promise<Document[]> {
    return Array.from(this.documents.values());
  }

  async deleteDocument(id: string): Promise<void> {
    this.documents.delete(id);
    const chunksToDelete = Array.from(this.documentChunks.values())
      .filter((chunk) => chunk.documentId === id)
      .map((chunk) => chunk.id);
    chunksToDelete.forEach((chunkId) => this.documentChunks.delete(chunkId));
  }

  // Document chunk operations
  async createDocumentChunk(insertChunk: InsertDocumentChunk): Promise<DocumentChunk> {
    const id = randomUUID();
    const chunk: DocumentChunk = {
      ...insertChunk,
      id,
      createdAt: new Date(),
    };
    this.documentChunks.set(id, chunk);
    return chunk;
  }

  async getDocumentChunks(documentId: string): Promise<DocumentChunk[]> {
    return Array.from(this.documentChunks.values()).filter(
      (chunk) => chunk.documentId === documentId
    );
  }

  async getAllChunks(): Promise<DocumentChunk[]> {
    return Array.from(this.documentChunks.values());
  }

  async updateChunkEmbeddingId(chunkId: string, embeddingId: string): Promise<void> {
    const chunk = this.documentChunks.get(chunkId);
    if (chunk) {
      chunk.embeddingId = embeddingId;
      this.documentChunks.set(chunkId, chunk);
    }
  }

  // Chat session operations
  async createChatSession(insertSession: InsertChatSession): Promise<ChatSession> {
    const id = randomUUID();
    const now = new Date();
    const session: ChatSession = {
      ...insertSession,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.chatSessions.set(id, session);
    return session;
  }

  async getChatSession(id: string): Promise<ChatSession | undefined> {
    return this.chatSessions.get(id);
  }

  async updateChatSessionTitle(id: string, title: string): Promise<void> {
    const session = this.chatSessions.get(id);
    if (session) {
      session.title = title;
      session.updatedAt = new Date();
      this.chatSessions.set(id, session);
    }
  }

  // Message operations
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      ...insertMessage,
      id,
      createdAt: new Date(),
    };
    this.messages.set(id, message);

    const session = this.chatSessions.get(insertMessage.sessionId);
    if (session) {
      session.updatedAt = new Date();
      this.chatSessions.set(session.id, session);
    }

    return message;
  }

  async getSessionMessages(sessionId: string): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter((msg) => msg.sessionId === sessionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

export const storage = new MemStorage();
