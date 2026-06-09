/**
 * File-based knowledge store implementation.
 *
 * Persists knowledge chunks as JSON files in the knowledge directory.
 * Uses atomic write pattern to prevent corruption.
 */

import { readFile, writeFile, rename, mkdir, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { randomUUID } from "node:crypto";
import { resolveDataPaths, resolveKnowledgeSourceDir } from "../config.js";
import { chunkFile, isSupportedExtension } from "./chunker.js";
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

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  throw new Error("Knowledge operation aborted");
}

/**
 * Configuration for FileKnowledgeStore.
 */
export interface FileKnowledgeStoreConfig {
  knowledgeDir?: string;
  sourceDir?: string;
}

/**
 * File-based implementation of KnowledgeStore.
 */
export class FileKnowledgeStore implements KnowledgeStore {
  private readonly knowledgeDir: string;
  private readonly sourceDir: string;
  private manifest: KnowledgeManifest | null = null;

  constructor(config?: FileKnowledgeStoreConfig) {
    const dataPaths = resolveDataPaths();
    this.knowledgeDir = config?.knowledgeDir ?? dataPaths.knowledge;
    this.sourceDir = config?.sourceDir ?? resolveKnowledgeSourceDir();
  }

  /**
   * Get the directory path for chunk files.
   */
  private getChunksDir(): string {
    return join(this.knowledgeDir, "chunks");
  }

  /**
   * Get the file path for a chunk ID.
   */
  private getChunkFilePath(id: string): string {
    return join(this.getChunksDir(), `chunk-${id}.json`);
  }

  /**
   * Get the manifest file path.
   */
  private getManifestPath(): string {
    return join(this.knowledgeDir, "manifest.json");
  }

  /**
   * Ensure a directory exists.
   */
  private async ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  /**
   * Atomically write JSON to a file.
   * Writes to a temp file first, then renames to prevent corruption.
   */
  private async atomicWriteJson(filePath: string, data: unknown): Promise<void> {
    await this.ensureDir(join(filePath, "..").toString());

    const tempPath = `${filePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
    await rename(tempPath, filePath);
  }

  /**
   * Get the current manifest, loading from disk if needed.
   */
  async getManifest(): Promise<KnowledgeManifest | null> {
    if (this.manifest) {
      return this.manifest;
    }

    const manifestPath = this.getManifestPath();
    try {
      const content = await readFile(manifestPath, "utf8");
      this.manifest = JSON.parse(content) as KnowledgeManifest;
      return this.manifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get a specific chunk by ID.
   */
  async getChunk(id: string): Promise<KnowledgeChunk | null> {
    const chunkPath = this.getChunkFilePath(id);
    try {
      const content = await readFile(chunkPath, "utf8");
      return JSON.parse(content) as KnowledgeChunk;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  /**
   * List all chunk metadata from the manifest.
   */
  async listChunks(): Promise<ChunkMetadata[]> {
    const manifest = await this.getManifest();
    return manifest?.chunks ?? [];
  }

  /**
   * Check if reindexing is needed.
   * Returns true if manifest is null, source files changed, or new files exist.
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
   * Scan the source directory for supported files.
   */
  private async scanSourceFiles(): Promise<SourceMetadata[]> {
    await this.ensureDir(this.sourceDir);

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
    throwIfAborted(options?.signal);
    const sourceFiles = await this.scanSourceFiles();
    const chunksDir = this.getChunksDir();
    await this.ensureDir(chunksDir);

    const allChunks: ChunkMetadata[] = [];
    const sources: SourceMetadata[] = [];

    for (const sourceFile of sourceFiles) {
      throwIfAborted(options?.signal);
      try {
        const content = await readFile(sourceFile.absolutePath, "utf8");
        const chunks = chunkFile(sourceFile.path, content);

        // Write each chunk to disk
        for (const chunk of chunks) {
          const chunkPath = this.getChunkFilePath(chunk.id);
          await this.atomicWriteJson(chunkPath, chunk);

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

    // Write manifest
    const manifest: KnowledgeManifest = {
      version: 1,
      lastIndexed: new Date().toISOString(),
      sourceDir: this.sourceDir,
      chunks: allChunks,
      sources,
    };

    await this.atomicWriteJson(this.getManifestPath(), manifest);
    this.manifest = manifest;

    return manifest;
  }

  /**
   * Search knowledge chunks matching a query.
   */
  async search(query: string, options?: SearchOptions): Promise<KnowledgeMatch[]> {
    throwIfAborted(options?.signal);
    // Trigger ingestion if needed
    if (await this.needsReindex()) {
      await this.ingest({ signal: options?.signal });
    }

    // Empty query returns empty array
    if (!query || query.trim().length === 0) {
      return [];
    }

    // Load all chunks
    const chunkMetadata = await this.listChunks();
    const chunks: KnowledgeChunk[] = [];

    for (const meta of chunkMetadata) {
      throwIfAborted(options?.signal);
      const chunk = await this.getChunk(meta.id);
      if (chunk) {
        chunks.push(chunk);
      }
    }

    // Score chunks
    const queryLower = query.toLowerCase();
    const matches: KnowledgeMatch[] = [];

    for (const chunk of chunks) {
      // Apply sourcePath filter if provided
      if (options?.sourcePath && !chunk.sourcePath.includes(options.sourcePath)) {
        continue;
      }

      // Apply tags filter if provided
      if (options?.tags && options.tags.length > 0) {
        const hasTag = options.tags.some((tag) => chunk.tags.includes(tag));
        if (!hasTag) {
          continue;
        }
      }

      const score = this.calculateRelevanceScore(chunk, queryLower);
      if (score > 0) {
        matches.push({
          chunk,
          relevanceScore: score,
          matchReason: this.getMatchReasons(chunk, queryLower),
        });
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Apply limit
    const limit = options?.limit ?? 5;
    return matches.slice(0, limit);
  }

  /**
   * Calculate relevance score for a chunk against a query.
   */
  private calculateRelevanceScore(chunk: KnowledgeChunk, queryLower: string): number {
    let score = 0;

    const textLower = chunk.text.toLowerCase();
    const headingLower = chunk.headingText.toLowerCase();
    const sourceLower = chunk.sourcePath.toLowerCase();

    // Substring match in text (+10)
    if (textLower.includes(queryLower)) {
      score += 10;
    }

    // Word overlap (+1 per word)
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 0);
    const textWords = textLower.split(/\s+/);
    const wordOverlap = queryWords.filter((w) => textWords.includes(w)).length;
    if (wordOverlap > 0) {
      score += wordOverlap;
    }

    // Heading match (+5)
    if (headingLower && headingLower.includes(queryLower)) {
      score += 5;
    }

    // Tag overlap (+2 per tag)
    const tagOverlap = chunk.tags.filter((t) =>
      queryLower.includes(t.toLowerCase())
    ).length;
    if (tagOverlap > 0) {
      score += tagOverlap * 2;
    }

    // Source path match (+3)
    if (sourceLower.includes(queryLower)) {
      score += 3;
    }

    return score;
  }

  /**
   * Get match reason string for a chunk.
   */
  private getMatchReasons(chunk: KnowledgeChunk, queryLower: string): string {
    const reasons: string[] = [];

    const textLower = chunk.text.toLowerCase();
    const headingLower = chunk.headingText.toLowerCase();
    const sourceLower = chunk.sourcePath.toLowerCase();

    if (textLower.includes(queryLower)) {
      reasons.push("text match");
    }

    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 0);
    const textWords = textLower.split(/\s+/);
    const wordOverlap = queryWords.filter((w) => textWords.includes(w)).length;
    if (wordOverlap > 0) {
      reasons.push(`${wordOverlap} word(s) matched`);
    }

    if (headingLower && headingLower.includes(queryLower)) {
      reasons.push("heading match");
    }

    const tagOverlap = chunk.tags.filter((t) =>
      queryLower.includes(t.toLowerCase())
    ).length;
    if (tagOverlap > 0) {
      reasons.push("tag match");
    }

    if (sourceLower.includes(queryLower)) {
      reasons.push("source path match");
    }

    return reasons.join(", ");
  }
}
