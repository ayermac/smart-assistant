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
import { getMultimodalEmbedding, imageToBase64 } from "./multimodal-embedding.js";
import type {
  KnowledgeChunk,
  KnowledgeManifest,
  KnowledgeMatch,
  KnowledgeStore,
  ChunkMetadata,
  SourceMetadata,
  SearchOptions,
  ImageReference,
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private manifest: KnowledgeManifest | null = null;
  private bm25: BM25Retriever | null = null;
  private bm25NeedsRebuild: boolean = true;

  constructor(config?: VectorKnowledgeStoreConfig) {
    this.embeddingConfig = config?.embeddingConfig ?? createDefaultEmbeddingConfig();
    this.dbPath = config?.dbPath ?? ".smart-assistant/vectors";
    this.sourceDir = config?.sourceDir ?? resolveKnowledgeSourceDir();
    this.vaultPath = config?.vaultPath;
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
      const schema = new Schema([
        new Field("id", new Utf8(), false),
        new Field("vector", new FixedSizeList(VECTOR_DIMENSIONS, new Field("item", new Float32()))),
        new Field("text", new Utf8(), false),
        new Field("sourcePath", new Utf8(), false),
        new Field("headingText", new Utf8(), false),
        new Field("headingLevel", new Int32(), false),
        new Field("tags", new List(new Field("item", new Utf8()))),
        new Field("createdAt", new Utf8(), false),
        // New columns for Phase 10 (optional)
        new Field("lastModified", new Int32(), true), // file mtime, nullable
        new Field("linkedNotes", new List(new Field("item", new Utf8())), true),
        new Field("imageVector", new FixedSizeList(VECTOR_DIMENSIONS, new Field("item", new Float32())), true),
      ]);

      this.table = await this.db.createEmptyTable("knowledge", schema);
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

    // Check if migration is needed
    if (existingFields.has("lastModified") && existingFields.has("linkedNotes")) {
      // Schema is up to date
      return;
    }

    // LanceDB requires the table to have at least one row to add columns
    // If table is empty, we need to clear it and let the new schema take effect
    const count = await table.countRows();
    if (count === 0) {
      // Table is empty, drop and recreate with full schema
      try {
        await this.db!.dropTable("knowledge");

        // Recreate with full schema
        const newSchema = new Schema([
          new Field("id", new Utf8(), false),
          new Field("vector", new FixedSizeList(VECTOR_DIMENSIONS, new Field("item", new Float32()))),
          new Field("text", new Utf8(), false),
          new Field("sourcePath", new Utf8(), false),
          new Field("headingText", new Utf8(), false),
          new Field("headingLevel", new Int32(), false),
          new Field("tags", new List(new Field("item", new Utf8()))),
          new Field("createdAt", new Utf8(), false),
          // New columns for Phase 10 (optional)
          new Field("lastModified", new Int32(), true), // file mtime, nullable
          new Field("linkedNotes", new List(new Field("item", new Utf8())), true),
          new Field("imageVector", new FixedSizeList(VECTOR_DIMENSIONS, new Field("item", new Float32())), true),
        ]);

        this.table = await this.db!.createEmptyTable("knowledge", newSchema);
        console.log("Migrated knowledge table schema: recreated with new columns");
      } catch (error) {
        console.warn(`Failed to recreate table: ${error}`);
      }
      return;
    }

    // Table has rows, try to add columns
    const columnsToAdd: { name: string; valueSql: string }[] = [];

    if (!existingFields.has("lastModified")) {
      columnsToAdd.push({ name: "lastModified", valueSql: "0" });
    }

    if (!existingFields.has("linkedNotes")) {
      columnsToAdd.push({ name: "linkedNotes", valueSql: "[]" });
    }

    if (columnsToAdd.length > 0) {
      try {
        await table.addColumns(columnsToAdd);
        console.log(`Migrated knowledge table schema: added ${columnsToAdd.map(c => c.name).join(", ")}`);
      } catch (error) {
        console.warn(`Failed to migrate schema: ${error}`);
        // Continue without new columns - will use fallback behavior
      }
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
        // Pass vaultPath for Obsidian parsing if configured
        const chunks = chunkFile(sourceFile.path, body, {
          maxChunkSize: 800,
          overlap: 80,
          vaultPath: this.vaultPath,
        });

        // Generate embeddings and store in LanceDB
        for (const chunk of chunks) {
          try {
            const vector = await getEmbedding(chunk.text, this.embeddingConfig);

            // Generate image vector for chunks with images if vaultPath is configured
            let imageVector: number[] | undefined;
            if (this.vaultPath && chunk.images && chunk.images.length > 0) {
              try {
                // Use the first image for multimodal embedding
                const image = chunk.images[0];
                const base64Image = await imageToBase64(image.path);
                if (base64Image) {
                  imageVector = await getMultimodalEmbedding(
                    { text: chunk.text, image: base64Image },
                    this.embeddingConfig
                  );
                }
              } catch (error) {
                // Log warning but continue with text-only embedding
                console.warn(`Failed to generate image vector for chunk ${chunk.id}: ${error}`);
              }
            }

            const record = {
              id: chunk.id,
              vector,
              text: chunk.text,
              sourcePath: chunk.sourcePath,
              headingText: chunk.headingText,
              headingLevel: chunk.headingLevel,
              tags: chunk.tags,
              createdAt: chunk.createdAt,
              // Store image vector if available
              ...(imageVector ? { imageVector } : {}),
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
              // Add linkedNotes if present
              ...(chunk.linkedNotes ? { linkedNotes: chunk.linkedNotes } : {}),
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

  /**
   * Index a single file.
   * Reads file content, chunks it, generates embeddings, and stores in LanceDB.
   */
  async indexFile(filePath: string): Promise<void> {
    const table = this.ensureTable();

    // Check schema for optional fields
    let schemaHasLastModified = false;
    let schemaHasLinkedNotes = false;
    let schemaHasImageVector = false;

    try {
      const schema = await table.schema();
      const fieldNames = new Set(schema.fields.map(f => f.name));
      schemaHasLastModified = fieldNames.has("lastModified");
      schemaHasLinkedNotes = fieldNames.has("linkedNotes");
      schemaHasImageVector = fieldNames.has("imageVector");
    } catch {
      // Schema check failed, assume base schema only
    }

    try {
      const content = await readFile(filePath, "utf8");

      // Apply text cleaning before chunking
      const cleaned = cleanText(content);

      // Extract frontmatter if present
      const { body } = extractFrontmatter(cleaned);

      // Get relative path for storage
      const relativePath = relative(this.sourceDir, filePath);

      // Chunk with three-layer strategy and overlap
      const chunks = chunkFile(relativePath, body, {
        maxChunkSize: 800,
        overlap: 80,
        vaultPath: this.vaultPath,
      });

      // Get file modification time (only used if schema supports it)
      let lastModified: number | undefined;
      if (schemaHasLastModified) {
        const fileStat = await stat(filePath);
        lastModified = fileStat.mtimeMs;
      }

      // Generate embeddings and store in LanceDB
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        try {
          // Add delay between chunks for rate limiting (skip first chunk)
          if (i > 0) {
            await delay(EMBED_DELAY_MS);
          }

          // Get embedding with retry logic for rate limiting
          let vector: number[] | null = null;
          for (let retry = 0; retry < MAX_RETRIES; retry++) {
            try {
              vector = await getEmbedding(chunk.text, this.embeddingConfig);
              break;
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              if (errorMsg.includes("429") || errorMsg.includes("RateLimit")) {
                // Rate limit - exponential backoff
                const backoffDelay = RETRY_BASE_DELAY_MS * Math.pow(2, retry);
                console.warn(`Rate limit hit, retrying in ${backoffDelay}ms (attempt ${retry + 1}/${MAX_RETRIES})`);
                await delay(backoffDelay);
                continue;
              }
              throw error;
            }
          }

          if (!vector) {
            console.warn(`Failed to embed chunk ${chunk.id} after ${MAX_RETRIES} retries`);
            continue;
          }

          // Generate image vector for chunks with images if vaultPath is configured
          let imageVector: number[] | undefined;
          if (this.vaultPath && chunk.images && chunk.images.length > 0 && schemaHasImageVector) {
            try {
              const image = chunk.images[0];
              const base64Image = await imageToBase64(image.path);
              if (base64Image) {
                await delay(EMBED_DELAY_MS); // Delay before multimodal embedding
                imageVector = await getMultimodalEmbedding(
                  { text: chunk.text, image: base64Image },
                  this.embeddingConfig
                );
              }
            } catch (error) {
              console.warn(`Failed to generate image vector for chunk ${chunk.id}: ${error}`);
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
          if (schemaHasLastModified && lastModified !== undefined) {
            record.lastModified = lastModified;
          }

          if (schemaHasLinkedNotes && chunk.linkedNotes && chunk.linkedNotes.length > 0) {
            record.linkedNotes = chunk.linkedNotes;
          }

          if (imageVector) {
            record.imageVector = imageVector;
          }

          await table.add([record]);
        } catch (error) {
          console.warn(`Failed to embed chunk ${chunk.id}: ${error}`);
        }
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
    await this.removeFile(filePath);
    await this.indexFile(filePath);
  }

  /**
   * Remove all chunks belonging to a file.
   */
  async removeFile(filePath: string): Promise<void> {
    const table = this.ensureTable();

    try {
      // Get relative path for matching
      const relativePath = relative(this.sourceDir, filePath);

      // Delete chunks matching this source path
      await table.delete(`sourcePath = '${relativePath}'`);

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
        .select(["sourcePath", "lastModified"])
        .toArray();

      for (const row of results) {
        const record = row as { sourcePath?: string; lastModified?: number };
        if (record.sourcePath) {
          // Keep track of the most recent lastModified for each file
          const existing = existingFiles.get(record.sourcePath) ?? 0;
          if (record.lastModified && record.lastModified > existing) {
            existingFiles.set(record.sourcePath, record.lastModified);
          }
        }
      }
    } catch (error) {
      // Column doesn't exist yet - treat all files as new
      // This happens when upgrading from an older schema
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("lastModified")) {
        console.log("Note: lastModified column not found, performing full sync");
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
          await table.delete(`sourcePath = '${sourcePath}'`);
          stats.removed++;
        } catch (error) {
          console.warn(`Failed to remove deleted file ${sourcePath}: ${error}`);
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

      if (!existingMtime) {
        // New file - index it
        processedFiles++;
        console.log(`[${processedFiles}/${totalFiles}] Indexing: ${file.path}`);
        try {
          await this.indexFile(file.absolutePath);
          stats.added++;
        } catch (error) {
          console.warn(`Failed to index new file ${file.path}: ${error}`);
        }
      } else if (file.mtime > existingMtime) {
        // Modified file - reindex it
        processedFiles++;
        console.log(`[${processedFiles}/${totalFiles}] Reindexing: ${file.path}`);
        try {
          await this.reindexFile(file.absolutePath);
          stats.updated++;
        } catch (error) {
          console.warn(`Failed to reindex modified file ${file.path}: ${error}`);
        }
      }
    }

    if (processedFiles === 0) {
      console.log(`Vault already up to date (${totalFiles} files)`);
    }

    // Mark BM25 index for rebuild
    if (stats.added > 0 || stats.updated > 0 || stats.removed > 0) {
      this.bm25NeedsRebuild = true;
    }

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
