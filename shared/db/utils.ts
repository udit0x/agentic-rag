// Database utilities for cross-database compatibility and performance
import { sql } from "drizzle-orm";
import { generateUUID } from "../schemas/base";

// Helper functions for cross-database JSON handling
export const serializeJson = (data: any): string | null => {
  if (data === null || data === undefined) return null;
  return JSON.stringify(data);
};

export const deserializeJson = <T>(data: string | null): T | null => {
  if (!data) return null;
  try {
    return JSON.parse(data) as T;
  } catch (error) {
    console.warn('Failed to parse JSON data:', error);
    return null;
  }
};

// UUID generation that works across both SQLite and PostgreSQL
export const createUUID = (): string => {
  return generateUUID();
};

// Date helpers for cross-database compatibility
export const toISOString = (date: Date): string => {
  return date.toISOString();
};

export const fromISOString = (dateStr: string): Date => {
  return new Date(dateStr);
};

// Performance helpers
export const incrementSql = (column: any) => sql`${column} + 1`;
export const decrementSql = (column: any) => sql`${column} - 1`;

// Query optimization helpers
export const getNextSequenceNumber = async (
  db: any, 
  table: any, 
  column: any, 
  whereClause: any
): Promise<number> => {
  const result = await db.select({ 
    maxNum: sql`COALESCE(MAX(${column}), 0)` 
  })
  .from(table)
  .where(whereClause);
  
  return (result[0]?.maxNum || 0) + 1;
};

// Batch operation helpers
export const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

// Error handling utilities
export class DatabaseError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export const handleDatabaseError = (error: any, operation: string): never => {
  console.error(`Database operation failed: ${operation}`, error);
  throw new DatabaseError(`${operation} failed: ${error.message}`, error);
};