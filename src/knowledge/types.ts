/**
 * Knowledge types - defines interfaces for RAG knowledge persistence and retrieval.
 */

/**
 * Represents a chunked segment of ingested knowledge.
 */
export interface KnowledgeChunk {
  id: string;
  sourcePath: string;
  headingLevel: number;
  headingText: string;
  text: string;
  startLine: number;
  endLine: number;
  tags: string[];
  createdAt: string;
}

/**
 * Metadata about a knowledge match, including relevance information.
 */
export interface KnowledgeMatch {
  chunk: KnowledgeChunk;
  relevanceScore: number;
  matchReason: string;
}

/**
 * Options for knowledge search operations.
 */
export interface SearchOptions {
  tags?: string[];
  limit?: number;
  sourcePath?: string;
}

/**
 * Metadata about a chunk for manifest listing.
 */
export interface ChunkMetadata {
  id: string;
  sourcePath: string;
  headingText: string;
  headingLevel: number;
  tags: string[];
  lineCount: number;
  charCount: number;
  modifiedAt: string;
}

/**
 * Metadata about an indexed source file.
 */
export interface SourceMetadata {
  path: string;
  absolutePath: string;
  mtime: number;
  chunkCount: number;
}

/**
 * Manifest tracking all indexed knowledge chunks and sources.
 */
export interface KnowledgeManifest {
  version: 1;
  lastIndexed: string;
  sourceDir: string;
  chunks: ChunkMetadata[];
  sources: SourceMetadata[];
}

/**
 * Interface for knowledge persistence and retrieval operations.
 */
export interface KnowledgeStore {
  /** Initialize the store (optional, for async resource setup). */
  init?(): Promise<void>;

  /** Ingest files from the knowledge source directory. */
  ingest(): Promise<KnowledgeManifest>;

  /** Search knowledge chunks matching a query. */
  search(query: string, options?: SearchOptions): Promise<KnowledgeMatch[]>;

  /** Get the current manifest. */
  getManifest(): Promise<KnowledgeManifest | null>;

  /** Check if reindexing is needed. */
  needsReindex(): Promise<boolean>;

  /** Get a specific chunk by ID. */
  getChunk(id: string): Promise<KnowledgeChunk | null>;

  /** List all chunk metadata. */
  listChunks(): Promise<ChunkMetadata[]>;
}
