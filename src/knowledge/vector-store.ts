/**
 * Vector-based knowledge store using LanceDB and Doubao embeddings.
 *
 * Provides hybrid semantic + keyword search for knowledge chunks.
 * Uses vector similarity (LanceDB) + BM25 keyword retrieval + RRF fusion.
 */

import * as lancedb from "@lancedb/lancedb";
import { type Vector, Field, FixedSizeList, Float32, Int32, List, Schema, Utf8 } from "apache-arrow";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, stat, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { resolveKnowledgeSourceDir } from "../config.js";
import { getEmbedding, createDefaultEmbeddingConfig, type EmbeddingConfig } from "../memory/embedding.js";
import { chunkFile, isSupportedExtension } from "./chunker.js";
import { cleanText, extractFrontmatter } from "./cleaner.js";
import { BM25Retriever, type BM25Match } from "./bm25.js";
import { rrfFusion, type VectorMatch, type FusedResult } from "./fusion.js";
import type {
  KnowledgeChunk,
  KnowledgeManifest,
  KnowledgeMatch,
  KnowledgeStore,
  ChunkMetadata,
  SourceMetadata,
  SearchOptions,
} from "./types.js";

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
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private manifest: KnowledgeManifest | null = null;
  private bm25: BM25Retriever | null = null;
  private bm25NeedsRebuild: boolean = true;

  constructor(config?: VectorKnowledgeStoreConfig) {
    this.embeddingConfig = config?.embeddingConfig ?? createDefaultEmbeddingConfig();
    this.dbPath = config?.dbPath ?? ".smart-assistant/vectors";
    this.sourceDir = config?.sourceDir ?? resolveKnowledgeSourceDir();
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
    } else {
      // Create table with explicit schema
      const schema = new Schema([
        new Field("id", new Utf8(), false),
        new Field("vector", new FixedSizeList(VECTOR_DIMENSIONS, new Field("item", new Float32()))),
        new Field("text", new Utf8(), false),
        new Field("sourcePath", new Utf8(), false),
        new Field("headingText", new Utf8(), false),
        new Field("headingLevel", new Int32(), false),
        new Field("tags", new List(new Field("item", new Utf8()))),
        new Field("createdAt", new Utf8(), false),
      ]);

      this.table = await this.db.createEmptyTable("knowledge", schema);
    }
  }

  private ensureTable(): lancedb.Table {
    if (!this.table) {
      throw new Error("VectorKnowledgeStore not initialized. Call init() first.");
    }
    return this.table;
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
  async ingest(): Promise<KnowledgeManifest> {
    const table = this.ensureTable();
    const sourceFiles = await this.scanSourceFiles();

    const allChunks: ChunkMetadata[] = [];
    const sources: SourceMetadata[] = [];

    for (const sourceFile of sourceFiles) {
      try {
        const content = await readFile(sourceFile.absolutePath, "utf8");

        // Apply text cleaning before chunking
        const cleaned = cleanText(content);

        // Extract frontmatter if present (for metadata enrichment)
        const { body } = extractFrontmatter(cleaned);

        // Chunk with three-layer strategy and overlap
        const chunks = chunkFile(sourceFile.path, body, { maxChunkSize: 800, overlap: 80 });

        // Generate embeddings and store in LanceDB
        for (const chunk of chunks) {
          try {
            const vector = await getEmbedding(chunk.text, this.embeddingConfig);

            const record = {
              id: chunk.id,
              vector,
              text: chunk.text,
              sourcePath: chunk.sourcePath,
              headingText: chunk.headingText,
              headingLevel: chunk.headingLevel,
              tags: chunk.tags,
              createdAt: chunk.createdAt,
            };

            await table.add([record]);

            allChunks.push({
              id: chunk.id,
              sourcePath: chunk.sourcePath,
              headingText: chunk.headingText,
              headingLevel: chunk.headingLevel,
              tags: chunk.tags,
              lineCount: chunk.endLine - chunk.startLine + 1,
              charCount: chunk.text.length,
              modifiedAt: chunk.createdAt,
            });
          } catch (error) {
            // Log warning and skip chunks that fail to embed
            console.warn(`Failed to embed chunk ${chunk.id}: ${error}`);
          }
        }

        sources.push({
          ...sourceFile,
          chunkCount: chunks.length,
        });
      } catch (error) {
        // Log warning and skip files that fail to read
        console.warn(`Failed to ingest ${sourceFile.path}: ${error}`);
      }
    }

    // Build manifest
    const manifest: KnowledgeManifest = {
      version: 1,
      lastIndexed: new Date().toISOString(),
      sourceDir: this.sourceDir,
      chunks: allChunks,
      sources,
    };

    this.manifest = manifest;

    // Mark BM25 index for rebuild
    this.bm25NeedsRebuild = true;

    return manifest;
  }

  /**
   * Search knowledge chunks using hybrid retrieval (vector + BM25 + RRF fusion).
   */
  async search(query: string, options?: SearchOptions): Promise<KnowledgeMatch[]> {
    const table = this.ensureTable();

    // Trigger ingestion if needed
    if (await this.needsReindex()) {
      await this.ingest();
    }

    // Empty query returns empty array
    if (!query || query.trim().length === 0) {
      return [];
    }

    const limit = options?.limit ?? 5;

    // Generate embedding for query
    const queryVector = await getEmbedding(query, this.embeddingConfig);

    // Vector search (top 20)
    let vectorSearchQuery = table.vectorSearch(queryVector).limit(20);

    // Add sourcePath filter if provided
    if (options?.sourcePath) {
      vectorSearchQuery = vectorSearchQuery.where(`sourcePath LIKE '%${options.sourcePath}%'`) as typeof vectorSearchQuery;
    }

    const vectorResults = await vectorSearchQuery
      .select(["id", "text", "sourcePath", "headingText", "headingLevel", "tags", "createdAt", "_distance"])
      .toArray();

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
    await this.ensureBM25Index();
    const bm25Results: BM25Match[] = this.bm25!.search(query, 20);

    // RRF fusion
    const fused = rrfFusion(vectorMatches, bm25Results, { topN: limit });

    // Map fused results to KnowledgeMatch[]
    // We need to re-fetch full chunk data for the fused results
    const matches: KnowledgeMatch[] = [];

    for (const fusedResult of fused) {
      // Find full chunk data from vector results first
      const vectorRecord = vectorResults.find((row) => {
        const r = row as { id?: string };
        return r.id === fusedResult.chunkId;
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
        id: fusedResult.chunkId,
        sourcePath: vectorRecord?.sourcePath ?? "",
        headingText: vectorRecord?.headingText ?? "",
        headingLevel: vectorRecord?.headingLevel ?? 0,
        text: fusedResult.text,
        startLine: 0,
        endLine: 0,
        tags: vectorRecord ? arrowToStringArray(vectorRecord.tags) : [],
        createdAt: vectorRecord?.createdAt ?? new Date().toISOString(),
      };

      matches.push({
        chunk,
        relevanceScore: fusedResult.rrfScore,
        matchReason: "hybrid (vector + BM25)",
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
        .select(["id", "sourcePath", "headingText", "headingLevel", "tags", "text", "createdAt"])
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
        };

        if (record.id && record.text && record.sourcePath) {
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
            sourceMap.set(record.sourcePath, {
              path: record.sourcePath,
              absolutePath: join(this.sourceDir, record.sourcePath),
              mtime: 0,
              chunkCount: 0,
            });
          }
          const source = sourceMap.get(record.sourcePath)!;
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
        if (fileStat.mtimeMs !== source.mtime) {
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
        .where(`id = '${id}'`)
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
}
