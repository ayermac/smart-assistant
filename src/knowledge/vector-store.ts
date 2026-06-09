/**
 * Vector-based knowledge store using LanceDB and Doubao embeddings.
 *
 * Provides hybrid semantic + keyword search for knowledge chunks.
 * Uses vector similarity (LanceDB) + BM25 keyword retrieval + RRF fusion.
 */

import * as lancedb from "@lancedb/lancedb";
import { type Vector, Field, FixedSizeList, Float32, Float64, Int32, List, Schema, Utf8 } from "apache-arrow";
import { mkdir, readdir, stat, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { resolveDataPaths, resolveKnowledgeSourceDir } from "../config.js";
import { getEmbedding, createDefaultEmbeddingConfig, type EmbeddingConfig } from "../memory/embedding.js";
import { chunkFile, chunkBinaryFile, isSupportedExtension, isBinaryFormat } from "./chunker.js";
import { cleanText, extractFrontmatter } from "./cleaner.js";
import { BM25Retriever, type BM25Match } from "./bm25.js";
import { rrfFusion, type VectorMatch } from "./fusion.js";
import { getMultimodalEmbedding, imageToBase64 } from "./multimodal-embedding.js";
import type { Reranker } from "./rerank/index.js";
import { noopReranker, createRerankerFromEnv } from "./rerank/index.js";
import { createLogger, timeAsync, type Logger } from "../logger.js";
import { AsyncOperationQueue } from "./write-queue.js";
import type {
  KnowledgeChunk,
  KnowledgeManifest,
  KnowledgeMatch,
  KnowledgeStore,
  ChunkMetadata,
  SourceMetadata,
  SearchOptions,
  IngestOptions,
} from "./types.js";

/**
 * Delay for rate limiting between API calls.
 */
const EMBED_DELAY_MS = 200;

/**
 * Maximum retries for embedding API calls on rate limit errors.
 */
const MAX_RETRIES = 3;

/**
 * Base delay for exponential backoff on rate limit errors.
 */
const RETRY_BASE_DELAY_MS = 1000;
const MIN_VALID_MTIME_MS = 946684800000; // 2000-01-01T00:00:00.000Z
const MTIME_FUTURE_TOLERANCE_MS = 60_000;

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Knowledge operation aborted"));
      return;
    }

    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      reject(new Error("Knowledge operation aborted"));
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  throw new Error("Knowledge operation aborted");
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

export function getStoredMtimeMs(lastModifiedMs?: number, lastModified?: number): number {
  if (typeof lastModifiedMs === "number" && Number.isFinite(lastModifiedMs) && lastModifiedMs >= MIN_VALID_MTIME_MS) {
    return lastModifiedMs;
  }

  // Compatibility with the short-lived Float64 lastModified schema that stored mtimeMs directly.
  if (typeof lastModified === "number" && Number.isFinite(lastModified) && lastModified >= MIN_VALID_MTIME_MS) {
    return lastModified;
  }

  return 0;
}

export function isUsableStoredMtime(storedMtimeMs: number | undefined, currentMtimeMs: number): boolean {
  return (
    storedMtimeMs !== undefined &&
    Number.isFinite(storedMtimeMs) &&
    storedMtimeMs >= MIN_VALID_MTIME_MS &&
    storedMtimeMs <= currentMtimeMs + MTIME_FUTURE_TOLERANCE_MS
  );
}

function createKnowledgeTableSchema(): Schema {
  return new Schema([
    new Field("id", new Utf8(), false),
    new Field("vector", new FixedSizeList(VECTOR_DIMENSIONS, new Field("item", new Float32()))),
    new Field("text", new Utf8(), false),
    new Field("sourcePath", new Utf8(), false),
    new Field("headingText", new Utf8(), false),
    new Field("headingLevel", new Int32(), false),
    new Field("tags", new List(new Field("item", new Utf8()))),
    new Field("createdAt", new Utf8(), false),
    new Field("lastModified", new Float64(), true), // file mtime seconds, nullable
    new Field("lastModifiedMs", new Float64(), true), // file mtime milliseconds, nullable
    new Field("linkedNotes", new List(new Field("item", new Utf8())), true),
    new Field("imageVector", new FixedSizeList(VECTOR_DIMENSIONS, new Field("item", new Float32())), true),
  ]);
}

export function hasCompatibleKnowledgeMtimeSchema(schema: Schema): boolean {
  const fields = new Map(schema.fields.map((field) => [field.name, field]));
  const lastModified = fields.get("lastModified");
  const lastModifiedMs = fields.get("lastModifiedMs");

  return (
    lastModified !== undefined &&
    String(lastModified.type) === "Float64" &&
    lastModified.nullable === true &&
    lastModifiedMs !== undefined &&
    String(lastModifiedMs.type) === "Float64" &&
    lastModifiedMs.nullable === true
  );
}

/**
 * Vector dimensions for Doubao embedding model.
 * doubao-embedding-vision produces 2048-dimensional vectors.
 */
const VECTOR_DIMENSIONS = 2048;

/**
 * Convert Arrow list/vector to JavaScript array of strings.
 */
function arrowToStringArray(value: unknown): string[] {
  if (!value) return [];
  // Arrow Vector has toArray() method
  if (typeof value === "object" && "toArray" in (value as object)) {
    return Array.from((value as Vector).toArray()) as string[];
  }
  // Already an array
  if (Array.isArray(value)) return value;
  return [];
}

/**
 * Configuration for VectorKnowledgeStore.
 */
export interface VectorKnowledgeStoreConfig {
  /** Embedding configuration */
  embeddingConfig?: EmbeddingConfig;
  /** LanceDB database path */
  dbPath?: string;
  /** Knowledge source directory */
  sourceDir?: string;
  /** Obsidian vault path for multimodal embedding */
  vaultPath?: string;
  /** Reranker for improving search relevance (default: from env or noop) */
  reranker?: Reranker;
  /** Enable reranking (default: from RERANK_ENABLED env var) */
  enableRerank?: boolean;
}

/**
 * Vector-based implementation of KnowledgeStore using LanceDB.
 *
 * Stores knowledge chunks as vectors and provides semantic search.
 */
export class VectorKnowledgeStore implements KnowledgeStore {
  private readonly embeddingConfig: EmbeddingConfig;
  private readonly dbPath: string;
  private readonly sourceDir: string;
  private readonly vaultPath?: string;
  private readonly reranker: Reranker;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private manifest: KnowledgeManifest | null = null;
  private bm25: BM25Retriever | null = null;
  private bm25NeedsRebuild: boolean = true;
  private readonly logger: Logger;
  private readonly writeQueue = new AsyncOperationQueue();

  constructor(config?: VectorKnowledgeStoreConfig) {
    this.embeddingConfig = config?.embeddingConfig ?? createDefaultEmbeddingConfig();
    this.dbPath = config?.dbPath ?? resolveDataPaths().vectors;
    this.sourceDir = config?.sourceDir ?? resolveKnowledgeSourceDir();
    this.vaultPath = config?.vaultPath;

    // Initialize reranker from config or environment
    if (config?.reranker) {
      this.reranker = config.reranker;
    } else if (config?.enableRerank ?? process.env.RERANK_ENABLED === "true") {
      this.reranker = createRerankerFromEnv();
    } else {
      this.reranker = noopReranker;
    }

    this.logger = createLogger("knowledge");
  }

  private async runRead<T>(operation: string, task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.writeQueue.size > 0) {
      this.logger.debug("knowledge read waiting", {
        operation,
        pendingOperations: this.writeQueue.size,
      });
    }

    return this.writeQueue.runRead(
      () => timeAsync(this.logger, "debug", `knowledge.${operation}`, task, { operation }),
      signal
    );
  }

  private async runWrite<T>(operation: string, task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.writeQueue.size > 0) {
      this.logger.debug("knowledge write waiting", {
        operation,
        pendingOperations: this.writeQueue.size,
      });
    }

    return this.writeQueue.runWrite(
      () => timeAsync(this.logger, "debug", `knowledge.${operation}`, task, { operation }),
      signal
    );
  }

  /**
   * Initialize the LanceDB connection and create/open the knowledge table.
   * Must be called before any other operations.
   */
  async init(): Promise<void> {
    // Ensure parent directory exists
    await mkdir(this.dbPath, { recursive: true });

    this.db = await lancedb.connect(this.dbPath);

    const tableNames = await this.db.tableNames();
    if (tableNames.includes("knowledge")) {
      this.table = await this.db.openTable("knowledge");

      // Migrate schema: add missing columns if they don't exist
      await this.migrateSchema();
    } else {
      // Create table with explicit schema
      this.table = await this.db.createEmptyTable("knowledge", createKnowledgeTableSchema());
    }
  }

  /**
   * Migrate schema to add missing columns from newer versions.
   * LanceDB supports adding columns via addColumns method.
   */
  private async migrateSchema(): Promise<void> {
    const table = this.ensureTable();

    // Get current schema
    let schema;
    try {
      schema = await table.schema();
    } catch {
      // Table might be empty or have issues, skip migration
      return;
    }

    const existingFields = new Set(schema.fields.map((f) => f.name));

    if (!hasCompatibleKnowledgeMtimeSchema(schema)) {
      await this.recreateKnowledgeTable("Migrated knowledge table schema: recreated to repair mtime columns");
      return;
    }

    // Check if migration is needed
    if (existingFields.has("lastModified") && existingFields.has("lastModifiedMs") && existingFields.has("linkedNotes")) {
      // Schema is up to date
      return;
    }

    // LanceDB requires the table to have at least one row to add columns
    // If table is empty, we need to clear it and let the new schema take effect
    const count = await table.countRows();
    if (count === 0) {
      // Table is empty, drop and recreate with full schema
      await this.recreateKnowledgeTable("Migrated knowledge table schema: recreated with new columns");
      return;
    }

    // Table has rows, try to add columns
    const columnsToAdd: { name: string; valueSql: string }[] = [];

    if (!existingFields.has("lastModified")) {
      columnsToAdd.push({ name: "lastModified", valueSql: "0" });
    }

    if (!existingFields.has("lastModifiedMs")) {
      columnsToAdd.push({ name: "lastModifiedMs", valueSql: "0.0" });
    }

    if (!existingFields.has("linkedNotes")) {
      columnsToAdd.push({ name: "linkedNotes", valueSql: "[]" });
    }

    if (columnsToAdd.length > 0) {
      try {
        await table.addColumns(columnsToAdd);
        this.logger.info("Migrated knowledge table schema", {
          columns: columnsToAdd.map(c => c.name).join(","),
        });
      } catch (error) {
        this.logger.warn("Failed to migrate schema", {
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue without new columns - will use fallback behavior
      }
    }
  }

  private async recreateKnowledgeTable(message: string): Promise<void> {
    try {
      await this.db!.dropTable("knowledge");
      this.table = await this.db!.createEmptyTable("knowledge", createKnowledgeTableSchema());
      this.manifest = null;
      this.bm25 = null;
      this.bm25NeedsRebuild = true;
      this.logger.info(message);
    } catch (error) {
      this.logger.warn("Failed to recreate table", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private ensureTable(): lancedb.Table {
    if (!this.table) {
      throw new Error("VectorKnowledgeStore not initialized. Call init() first.");
    }
    return this.table;
  }

  private async getIndexedSourcePaths(): Promise<string[]> {
    const table = this.ensureTable();
    const rows = await table.query()
      .select(["sourcePath"])
      .toArray();

    const paths = new Set<string>();
    for (const row of rows) {
      const record = row as { sourcePath?: string };
      if (record.sourcePath) {
        paths.add(record.sourcePath);
      }
    }

    return Array.from(paths);
  }

  private async deleteSourcePath(sourcePath: string): Promise<void> {
    const table = this.ensureTable();
    await table.delete(`sourcePath = '${escapeSqlString(sourcePath)}'`);
    this.manifest = null;
  }

  /**
   * Ensure BM25 index is built. Rebuilds if needed.
   */
  private async ensureBM25Index(): Promise<void> {
    if (!this.bm25NeedsRebuild && this.bm25) {
      return;
    }

    const table = this.ensureTable();

    // Read all chunks from LanceDB
    const results = await table.query()
      .select(["id", "text", "sourcePath", "headingText", "headingLevel", "tags", "createdAt"])
      .toArray();

    const chunks: KnowledgeChunk[] = [];
    for (const row of results) {
      const record = row as {
        id?: string;
        text?: string;
        sourcePath?: string;
        headingText?: string;
        headingLevel?: number;
        tags?: unknown;
        createdAt?: string;
      };

      if (record.id && record.text) {
        chunks.push({
          id: record.id,
          sourcePath: record.sourcePath ?? "",
          headingText: record.headingText ?? "",
          headingLevel: record.headingLevel ?? 0,
          text: record.text,
          startLine: 0,
          endLine: 0,
          tags: arrowToStringArray(record.tags),
          createdAt: record.createdAt ?? new Date().toISOString(),
        });
      }
    }

    // Build BM25 index
    this.bm25 = new BM25Retriever();
    this.bm25.index(chunks);
    this.bm25NeedsRebuild = false;
  }

  /**
   * Scan the source directory for supported files.
   */
  private async scanSourceFiles(): Promise<SourceMetadata[]> {
    await mkdir(this.sourceDir, { recursive: true });

    const files: SourceMetadata[] = [];

    const scan = async (dir: string): Promise<void> => {
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        return;
      }

      for (const entry of entries) {
        // Skip hidden files
        if (entry.startsWith(".")) {
          continue;
        }

        const fullPath = join(dir, entry);
        const fileStat = await stat(fullPath);

        if (fileStat.isDirectory()) {
          await scan(fullPath);
        } else if (fileStat.isFile() && isSupportedExtension(entry)) {
          files.push({
            path: relative(this.sourceDir, fullPath),
            absolutePath: fullPath,
            mtime: fileStat.mtimeMs,
            chunkCount: 0, // Will be updated during ingestion
          });
        }
      }
    };

    await scan(this.sourceDir);
    return files;
  }

  /**
   * Ingest files from the knowledge source directory.
   */
  async ingest(options?: IngestOptions): Promise<KnowledgeManifest> {
    return this.runWrite("ingest", () => this.ingestUnlocked(options), options?.signal);
  }

  private async ingestUnlocked(options?: IngestOptions): Promise<KnowledgeManifest> {
    throwIfAborted(options?.signal);
    const sourceFiles = await this.scanSourceFiles();

    const indexedPaths = await this.getIndexedSourcePaths();
    for (const sourcePath of indexedPaths) {
      throwIfAborted(options?.signal);
      try {
        await this.deleteSourcePath(sourcePath);
      } catch (error) {
        this.logger.warn("Failed to remove existing chunks", {
          sourcePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    for (const sourceFile of sourceFiles) {
      throwIfAborted(options?.signal);
      try {
        await this.indexFileUnlocked(sourceFile.absolutePath, { signal: options?.signal });
      } catch (error) {
        this.logger.warn("Failed to ingest source file", {
          sourcePath: sourceFile.path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.manifest = null;
    const manifest = await this.getManifest() ?? {
      version: 1 as const,
      lastIndexed: new Date().toISOString(),
      sourceDir: this.sourceDir,
      chunks: [],
      sources: [],
    };

    // Mark BM25 index for rebuild
    this.bm25NeedsRebuild = true;

    return manifest;
  }

  /**
   * Search knowledge chunks using hybrid retrieval (vector + BM25 + RRF fusion).
   */
  async search(query: string, options?: SearchOptions): Promise<KnowledgeMatch[]> {
    const needsReindex = await this.runRead(
      "search.needsReindex",
      () => this.needsReindex(),
      options?.signal
    );

    if (needsReindex) {
      await this.ingest({ signal: options?.signal });
    }

    return this.runRead("search", () => this.searchUnlocked(query, options), options?.signal);
  }

  private async searchUnlocked(query: string, options?: SearchOptions): Promise<KnowledgeMatch[]> {
    throwIfAborted(options?.signal);
    const table = this.ensureTable();

    // Empty query returns empty array
    if (!query || query.trim().length === 0) {
      return [];
    }

    const limit = options?.limit ?? 5;

    // Generate embedding for query
    const queryVector = await timeAsync(
      this.logger,
      "debug",
      "knowledge.search.embedding",
      () => getEmbedding(query, this.embeddingConfig, { signal: options?.signal }),
      { queryLength: query.length }
    );
    throwIfAborted(options?.signal);

    // Vector search (top 20) - explicitly specify 'vector' column since table has multiple vector columns
    let vectorSearchQuery = table.vectorSearch(queryVector).column("vector").limit(20);

    // Add sourcePath filter if provided
    if (options?.sourcePath) {
      vectorSearchQuery = vectorSearchQuery.where(`sourcePath LIKE '%${escapeSqlString(options.sourcePath)}%'`) as typeof vectorSearchQuery;
    }

    const vectorResults = await timeAsync(
      this.logger,
      "debug",
      "knowledge.search.vector",
      () =>
        vectorSearchQuery
          .select(["id", "text", "sourcePath", "headingText", "headingLevel", "tags", "createdAt", "_distance"])
          .toArray(),
      { limit: 20 }
    );

    // Convert vector results to VectorMatch[]
    const vectorMatches: VectorMatch[] = [];
    for (const row of vectorResults) {
      const record = row as {
        id?: string;
        text?: string;
        sourcePath?: string;
        headingText?: string;
        headingLevel?: number;
        tags?: unknown;
        createdAt?: string;
        _distance?: number;
      };

      if (record.id && record.text) {
        // Apply tags filter if provided
        if (options?.tags && options.tags.length > 0) {
          const chunkTags = arrowToStringArray(record.tags);
          const hasTag = options.tags.some((tag) => chunkTags.includes(tag));
          if (!hasTag) {
            continue;
          }
        }

        const distance = record._distance ?? 0;
        const relevanceScore = Math.max(0, 1 / (1 + distance));

        vectorMatches.push({
          chunkId: record.id,
          text: record.text,
          score: relevanceScore,
        });
      }
    }

    // BM25 search (top 20)
    await timeAsync(
      this.logger,
      "debug",
      "knowledge.search.bm25Index",
      () => this.ensureBM25Index()
    );
    const bm25Results: BM25Match[] = await timeAsync(
      this.logger,
      "debug",
      "knowledge.search.bm25",
      async () => this.bm25!.search(query, 20),
      { limit: 20 }
    );

    // RRF fusion - get top 20 candidates for reranking
    const candidates = await timeAsync(
      this.logger,
      "debug",
      "knowledge.search.fusion",
      async () => rrfFusion(vectorMatches, bm25Results, { topN: 20 }),
      {
        vectorMatches: vectorMatches.length,
        bm25Matches: bm25Results.length,
      }
    );

    // Rerank candidates to get final results
    const reranked = await timeAsync(
      this.logger,
      "debug",
      "knowledge.search.rerank",
      () => this.reranker.rerank(query, candidates, { topN: limit, signal: options?.signal }),
      {
        candidates: candidates.length,
        limit,
        reranker: this.reranker.name,
      }
    );

    // Map reranked results to KnowledgeMatch[]
    // We need to re-fetch full chunk data for the reranked results
    const matches: KnowledgeMatch[] = [];

    for (const rerankedResult of reranked) {
      // Find full chunk data from vector results first
      const vectorRecord = vectorResults.find((row) => {
        const r = row as { id?: string };
        return r.id === rerankedResult.chunkId;
      }) as {
        id?: string;
        text?: string;
        sourcePath?: string;
        headingText?: string;
        headingLevel?: number;
        tags?: unknown;
        createdAt?: string;
        _distance?: number;
      } | undefined;

      const chunk: KnowledgeChunk = {
        id: rerankedResult.chunkId,
        sourcePath: vectorRecord?.sourcePath ?? "",
        headingText: vectorRecord?.headingText ?? "",
        headingLevel: vectorRecord?.headingLevel ?? 0,
        text: rerankedResult.text,
        startLine: 0,
        endLine: 0,
        tags: vectorRecord ? arrowToStringArray(vectorRecord.tags) : [],
        createdAt: vectorRecord?.createdAt ?? new Date().toISOString(),
      };

      matches.push({
        chunk,
        relevanceScore: rerankedResult.relevanceScore,
        matchReason: this.reranker.name === "noop"
          ? "hybrid (vector + BM25)"
          : `hybrid (vector + BM25) + rerank (${this.reranker.name})`,
      });
    }

    return matches;
  }

  /**
   * Get the current manifest.
   */
  async getManifest(): Promise<KnowledgeManifest | null> {
    if (this.manifest) {
      return this.manifest;
    }

    // Build manifest from LanceDB data
    const table = this.ensureTable();
    try {
      const results = await table.query()
        .select(["id", "sourcePath", "headingText", "headingLevel", "tags", "text", "createdAt", "lastModified", "lastModifiedMs"])
        .toArray();

      if (results.length === 0) {
        return null;
      }

      const chunks: ChunkMetadata[] = [];
      const sourceMap = new Map<string, SourceMetadata>();

      for (const row of results) {
        const record = row as {
          id?: string;
          sourcePath?: string;
          headingText?: string;
          headingLevel?: number;
          tags?: unknown;
          text?: string;
          createdAt?: string;
          lastModified?: number;
          lastModifiedMs?: number;
        };

        if (record.id && record.text && record.sourcePath) {
          const storedMtimeMs = getStoredMtimeMs(record.lastModifiedMs, record.lastModified);

          chunks.push({
            id: record.id,
            sourcePath: record.sourcePath,
            headingText: record.headingText ?? "",
            headingLevel: record.headingLevel ?? 0,
            tags: arrowToStringArray(record.tags),
            lineCount: 0,
            charCount: record.text.length,
            modifiedAt: record.createdAt ?? new Date().toISOString(),
          });

          // Track unique sources
          if (!sourceMap.has(record.sourcePath)) {
            const basePath = this.vaultPath ?? this.sourceDir;
            sourceMap.set(record.sourcePath, {
              path: record.sourcePath,
              absolutePath: join(basePath, record.sourcePath),
              mtime: storedMtimeMs,
              chunkCount: 0,
            });
          }
          const source = sourceMap.get(record.sourcePath)!;
          if (storedMtimeMs > source.mtime) {
            source.mtime = storedMtimeMs;
          }
          source.chunkCount++;
        }
      }

      const manifest: KnowledgeManifest = {
        version: 1,
        lastIndexed: new Date().toISOString(),
        sourceDir: this.sourceDir,
        chunks,
        sources: Array.from(sourceMap.values()),
      };

      this.manifest = manifest;
      return manifest;
    } catch {
      return null;
    }
  }

  /**
   * Check if reindexing is needed.
   */
  async needsReindex(): Promise<boolean> {
    const manifest = await this.getManifest();

    // No manifest means we need to index
    if (!manifest) {
      return true;
    }

    // Check for new files not in manifest
    const sourceFiles = await this.scanSourceFiles();
    const manifestSources = new Set(manifest.sources.map((s) => s.path));

    for (const file of sourceFiles) {
      if (!manifestSources.has(file.path)) {
        return true;
      }
    }

    // Check for modified files
    for (const source of manifest.sources) {
      try {
        const fileStat = await stat(source.absolutePath);
        if (!isUsableStoredMtime(source.mtime, fileStat.mtimeMs) || fileStat.mtimeMs !== source.mtime) {
          return true;
        }
      } catch {
        // File no longer exists, need reindex
        return true;
      }
    }

    return false;
  }

  /**
   * Get a specific chunk by ID.
   */
  async getChunk(id: string): Promise<KnowledgeChunk | null> {
    const table = this.ensureTable();

    try {
      const results = await table.query()
        .where(`id = '${escapeSqlString(id)}'`)
        .select(["id", "text", "sourcePath", "headingText", "headingLevel", "tags", "createdAt"])
        .limit(1)
        .toArray();

      if (results.length === 0) {
        return null;
      }

      const record = results[0] as {
        id?: string;
        text?: string;
        sourcePath?: string;
        headingText?: string;
        headingLevel?: number;
        tags?: unknown;
        createdAt?: string;
      };

      return {
        id: record.id ?? "",
        sourcePath: record.sourcePath ?? "",
        headingText: record.headingText ?? "",
        headingLevel: record.headingLevel ?? 0,
        text: record.text ?? "",
        startLine: 0,
        endLine: 0,
        tags: arrowToStringArray(record.tags),
        createdAt: record.createdAt ?? new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  /**
   * List all chunk metadata.
   */
  async listChunks(): Promise<ChunkMetadata[]> {
    const manifest = await this.getManifest();
    return manifest?.chunks ?? [];
  }

  /**
   * Index a single file.
   * Reads file content, chunks it, generates embeddings, and stores in LanceDB.
   */
  async indexFile(filePath: string, options?: IngestOptions): Promise<void> {
    return this.runWrite("indexFile", () => this.indexFileUnlocked(filePath, options), options?.signal);
  }

  private async indexFileUnlocked(filePath: string, options?: IngestOptions): Promise<void> {
    throwIfAborted(options?.signal);
    const table = this.ensureTable();

    // Check schema for optional fields
    let schemaHasLastModified = false;
    let schemaHasLastModifiedMs = false;
    let schemaHasLinkedNotes = false;
    let schemaHasImageVector = false;

    try {
      const schema = await table.schema();
      const fieldNames = new Set(schema.fields.map(f => f.name));
      schemaHasLastModified = fieldNames.has("lastModified");
      schemaHasLastModifiedMs = fieldNames.has("lastModifiedMs");
      schemaHasLinkedNotes = fieldNames.has("linkedNotes");
      schemaHasImageVector = fieldNames.has("imageVector");
    } catch {
      // Schema check failed, assume base schema only
    }

    try {
      // Get relative path for storage
      // Use vaultPath if available (for Obsidian vault files), otherwise use sourceDir
      const basePath = this.vaultPath ?? this.sourceDir;
      const relativePath = relative(basePath, filePath);
      await this.deleteSourcePath(relativePath);

      // Determine how to chunk based on file type
      let chunks: KnowledgeChunk[];

      if (isBinaryFormat(filePath)) {
        // Binary format (PDF, DOCX) - use document loader
        const loadedChunks = await chunkBinaryFile(filePath, {
          maxChunkSize: 800,
          overlap: 80,
          vaultPath: this.vaultPath,
          sourceFilePath: filePath,
        });
        chunks = loadedChunks.map((chunk) => ({
          ...chunk,
          sourcePath: relativePath,
        }));
      } else {
        // Text format (Markdown, TXT) - read and chunk directly
        const content = await readFile(filePath, "utf8");

        // Apply text cleaning before chunking
        const cleaned = cleanText(content);

        // Extract frontmatter if present
        const { body } = extractFrontmatter(cleaned);

        // Chunk with three-layer strategy and overlap
        chunks = chunkFile(relativePath, body, {
          maxChunkSize: 800,
          overlap: 80,
          vaultPath: this.vaultPath,
          sourceFilePath: filePath,
        });
      }

      const chunksWithImages = chunks.filter(c => c.images && c.images.length > 0);

      // Get file modification time (only used if schema supports it)
      let lastModifiedMs: number | undefined;
      if (schemaHasLastModified || schemaHasLastModifiedMs) {
        const fileStat = await stat(filePath);
        lastModifiedMs = fileStat.mtimeMs;
      }

      // Generate embeddings and store in LanceDB
      let imageVectorsStored = 0;
      let imageVectorsFailed = 0;

      for (let i = 0; i < chunks.length; i++) {
        throwIfAborted(options?.signal);
        const chunk = chunks[i];

        try {
          // Add delay between chunks for rate limiting (skip first chunk)
          if (i > 0) {
            await delay(EMBED_DELAY_MS, options?.signal);
          }

          // Get embedding with retry logic for rate limiting
          let vector: number[] | null = null;
          for (let retry = 0; retry < MAX_RETRIES; retry++) {
            try {
              vector = await getEmbedding(chunk.text, this.embeddingConfig, { signal: options?.signal });
              break;
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              if (errorMsg.includes("429") || errorMsg.includes("RateLimit")) {
                // Rate limit - exponential backoff
                const backoffDelay = RETRY_BASE_DELAY_MS * Math.pow(2, retry);
                this.logger.warn("Embedding rate limit hit", {
                  chunkId: chunk.id,
                  backoffDelay,
                  attempt: retry + 1,
                  maxRetries: MAX_RETRIES,
                });
                await delay(backoffDelay, options?.signal);
                continue;
              }
              throw error;
            }
          }

          if (!vector) {
            this.logger.warn("Failed to embed chunk after retries", {
              chunkId: chunk.id,
              maxRetries: MAX_RETRIES,
            });
            continue;
          }

          // Generate image vector for chunks with images if vaultPath is configured
          let imageVector: number[] | undefined;
          const willGenerateImageVector = this.vaultPath && chunk.images && chunk.images.length > 0 && schemaHasImageVector;

          if (willGenerateImageVector) {
            try {
              const image = chunk.images![0];
              const base64Image = await imageToBase64(image.path);
              if (base64Image) {
                await delay(EMBED_DELAY_MS, options?.signal); // Delay before multimodal embedding
                imageVector = await getMultimodalEmbedding(
                  { text: chunk.text, image: base64Image },
                  this.embeddingConfig,
                  { signal: options?.signal }
                );
              } else {
                imageVectorsFailed++;
              }
            } catch (error) {
              this.logger.warn("Failed to generate image vector", {
                chunkId: chunk.id,
                error: error instanceof Error ? error.message : String(error),
              });
              imageVectorsFailed++;
            }
          }

          // Build record, only including optional fields if schema supports them
          const record: Record<string, unknown> = {
            id: chunk.id,
            vector,
            text: chunk.text,
            sourcePath: chunk.sourcePath,
            headingText: chunk.headingText,
            headingLevel: chunk.headingLevel,
            tags: chunk.tags,
            createdAt: chunk.createdAt,
          };

          // Add optional fields only if schema supports them
          if (schemaHasLastModified && lastModifiedMs !== undefined) {
            record.lastModified = Math.floor(lastModifiedMs / 1000);
          }

          if (schemaHasLastModifiedMs && lastModifiedMs !== undefined) {
            record.lastModifiedMs = lastModifiedMs;
          }

          if (schemaHasLinkedNotes && chunk.linkedNotes && chunk.linkedNotes.length > 0) {
            record.linkedNotes = chunk.linkedNotes;
          }

          if (imageVector) {
            record.imageVector = imageVector;
            imageVectorsStored++;
          }

          await table.add([record]);
        } catch (error) {
          if (options?.signal?.aborted) {
            throw error;
          }
          this.logger.warn("Failed to embed chunk", {
            chunkId: chunk.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Summary log for image vectors
      if (chunksWithImages.length > 0) {
        this.logger.debug("Image vector summary", {
          stored: imageVectorsStored,
          failed: imageVectorsFailed,
          totalChunksWithImages: chunksWithImages.length,
        });
      }

      // Mark BM25 index for rebuild
      this.bm25NeedsRebuild = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to index file ${filePath}: ${message}`);
    }
  }

  /**
   * Reindex a file by removing old chunks and adding new ones.
   */
  async reindexFile(filePath: string): Promise<void> {
    return this.runWrite("reindexFile", () => this.reindexFileUnlocked(filePath));
  }

  private async reindexFileUnlocked(filePath: string): Promise<void> {
    await this.removeFileUnlocked(filePath);
    await this.indexFileUnlocked(filePath);
  }

  /**
   * Remove all chunks belonging to a file.
   */
  async removeFile(filePath: string): Promise<void> {
    return this.runWrite("removeFile", () => this.removeFileUnlocked(filePath));
  }

  private async removeFileUnlocked(filePath: string): Promise<void> {
    try {
      // Get relative path for matching
      // Use vaultPath if available (for Obsidian vault files), otherwise use sourceDir
      const basePath = this.vaultPath ?? this.sourceDir;
      const relativePath = relative(basePath, filePath);

      // Delete chunks matching this source path
      await this.deleteSourcePath(relativePath);

      // Mark BM25 index for rebuild
      this.bm25NeedsRebuild = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to remove file ${filePath}: ${message}`);
    }
  }

  /**
   * Sync vault by comparing modification times and processing only changed files.
   * Returns statistics about the sync operation.
   */
  async syncVault(vaultPath: string): Promise<{ added: number; updated: number; removed: number }> {
    return this.runWrite("syncVault", () => this.syncVaultUnlocked(vaultPath));
  }

  private async syncVaultUnlocked(vaultPath: string): Promise<{ added: number; updated: number; removed: number }> {
    const table = this.ensureTable();
    const stats = { added: 0, updated: 0, removed: 0 };

    // Scan vault for current files
    const currentFiles = await this.scanVaultFiles(vaultPath);
    const currentPaths = new Set(currentFiles.map((f) => f.path));

    // Get existing chunks from LanceDB to find removed files
    // Try to query with lastModified, but fall back gracefully if the column doesn't exist
    let existingFiles = new Map<string, number>();

    try {
      const results = await table.query()
        .select(["sourcePath", "lastModified", "lastModifiedMs"])
        .toArray();

      for (const row of results) {
        const record = row as { sourcePath?: string; lastModified?: number; lastModifiedMs?: number };
        if (record.sourcePath) {
          // Keep track of the most recent lastModified for each file
          const existing = existingFiles.get(record.sourcePath) ?? 0;
          const storedMtimeMs = getStoredMtimeMs(record.lastModifiedMs, record.lastModified);
          existingFiles.set(record.sourcePath, Math.max(existing, storedMtimeMs));
        }
      }
    } catch (error) {
      // Column doesn't exist yet - treat all files as new
      // This happens when upgrading from an older schema
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("lastModified")) {
        this.logger.info("lastModified column not found, performing full sync");
        // Query just sourcePath to get existing files
        try {
          const results = await table.query()
            .select(["sourcePath"])
            .toArray();

          for (const row of results) {
            const record = row as { sourcePath?: string };
            if (record.sourcePath) {
              existingFiles.set(record.sourcePath, 0);
            }
          }
        } catch {
          // If even this fails, proceed with empty existing files
        }
      } else {
        throw error;
      }
    }

    // Find and remove deleted files
    for (const [sourcePath] of existingFiles) {
      if (!currentPaths.has(sourcePath)) {
        try {
          await this.deleteSourcePath(sourcePath);
          stats.removed++;
        } catch (error) {
          this.logger.warn("Failed to remove deleted file", {
            sourcePath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Process current files (sequential with delay to avoid rate limiting)
    const totalFiles = currentFiles.length;
    let processedFiles = 0;

    for (let i = 0; i < currentFiles.length; i++) {
      const file = currentFiles[i];
      const existingMtime = existingFiles.get(file.path);

      // Add delay between files for rate limiting (skip first file)
      if (i > 0) {
        await delay(EMBED_DELAY_MS);
      }

      if (existingMtime === undefined) {
        // New file - index it
        processedFiles++;
        this.logger.debug("Indexing vault file", {
          processedFiles,
          totalFiles,
          sourcePath: file.path,
        });
        try {
          await this.indexFileUnlocked(file.absolutePath);
          stats.added++;
        } catch (error) {
          this.logger.warn("Failed to index new file", {
            sourcePath: file.path,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } else if (!isUsableStoredMtime(existingMtime, file.mtime) || file.mtime > existingMtime) {
        // Modified file - reindex it
        processedFiles++;
        this.logger.debug("Reindexing vault file", {
          processedFiles,
          totalFiles,
          sourcePath: file.path,
        });
        try {
          await this.reindexFileUnlocked(file.absolutePath);
          stats.updated++;
        } catch (error) {
          this.logger.warn("Failed to reindex modified file", {
            sourcePath: file.path,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (processedFiles === 0) {
      this.logger.debug("Vault already up to date", { totalFiles });
    }

    // Mark BM25 index for rebuild
    if (stats.added > 0 || stats.updated > 0 || stats.removed > 0) {
      this.bm25NeedsRebuild = true;
    }

    this.logger.debug("Vault sync stats", stats);
    return stats;
  }

  /**
   * Scan vault directory for Markdown files.
   */
  private async scanVaultFiles(vaultPath: string): Promise<SourceMetadata[]> {
    const files: SourceMetadata[] = [];

    const scan = async (dir: string): Promise<void> => {
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        return;
      }

      for (const entry of entries) {
        // Skip hidden files and directories
        if (entry.startsWith(".")) {
          continue;
        }

        const fullPath = join(dir, entry);
        const fileStat = await stat(fullPath);

        if (fileStat.isDirectory()) {
          await scan(fullPath);
        } else if (fileStat.isFile() && isSupportedExtension(entry)) {
          files.push({
            path: relative(vaultPath, fullPath),
            absolutePath: fullPath,
            mtime: fileStat.mtimeMs,
            chunkCount: 0,
          });
        }
      }
    };

    await scan(vaultPath);
    return files;
  }
}
