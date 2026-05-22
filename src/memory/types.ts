/**
 * Memory types - defines interfaces for long-term memory persistence.
 */

/**
 * Represents a persisted memory entry.
 */
export interface MemoryEntry {
  id: string;
  text: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Metadata about a memory match, including relevance information.
 */
export interface MemoryMatch {
  entry: MemoryEntry;
  relevanceScore: number;
  matchReason: string;
}

/**
 * Options for memory recall operations.
 */
export interface RecallOptions {
  tags?: string[];
  limit?: number;
}

/**
 * Interface for memory persistence operations.
 */
export interface MemoryStore {
  /** Store a new memory entry. */
  store(text: string, tags?: string[]): Promise<MemoryEntry>;

  /** Retrieve memories matching a query. */
  recall(query: string, options?: RecallOptions): Promise<MemoryMatch[]>;

  /** Get a specific memory by ID. */
  get(id: string): Promise<MemoryEntry | null>;

  /** List all memories. */
  list(): Promise<MemoryEntry[]>;

  /** Delete a memory by ID. */
  delete(id: string): Promise<boolean>;
}
