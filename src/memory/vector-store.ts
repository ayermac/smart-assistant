/**
 * Vector-based memory store using LanceDB and Doubao embeddings.
 *
 * Provides semantic search for long-term memory using vector similarity.
 * LanceDB runs embedded (no server required) and persists data to local disk.
 */

import * as lancedb from "@lancedb/lancedb";
import { type Vector, Field, FixedSizeList, Float32, Int32, List, Schema, Utf8 } from "apache-arrow";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveDataPaths } from "../config.js";
import { getEmbedding, type EmbeddingConfig } from "./embedding.js";
import type { MemoryEntry, MemoryMatch, MemoryStore, RecallOptions } from "./types.js";

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
 * Vector-based implementation of MemoryStore using LanceDB.
 *
 * LanceDB stores data locally on disk (similar to SQLite),
 * no separate server process is needed.
 */
export class VectorMemoryStore implements MemoryStore {
  private readonly embeddingConfig: EmbeddingConfig;
  private readonly dbPath: string;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;

  constructor(config: EmbeddingConfig, dbPath?: string) {
    this.embeddingConfig = config;
    this.dbPath = dbPath ?? resolveDataPaths().vectors;
  }

  /**
   * Initialize the LanceDB connection and create/open the memories table.
   * Must be called before any other operations.
   */
  async init(): Promise<void> {
    // Ensure parent directory exists
    await mkdir(dirname(this.dbPath), { recursive: true });

    this.db = await lancedb.connect(this.dbPath);

    const tableNames = await this.db.tableNames();
    if (tableNames.includes("memories")) {
      this.table = await this.db.openTable("memories");
    } else {
      // Create table with explicit schema
      // LanceDB needs explicit schema for list types
      const schema = new Schema([
        new Field("id", new Utf8(), false),
        new Field("vector", new FixedSizeList(VECTOR_DIMENSIONS, new Field("item", new Float32()))),
        new Field("text", new Utf8(), false),
        new Field("tags", new List(new Field("item", new Utf8()))),
        new Field("createdAt", new Utf8(), false),
        new Field("updatedAt", new Utf8(), false),
      ]);

      this.table = await this.db.createEmptyTable("memories", schema);
    }
  }

  private ensureTable(): lancedb.Table {
    if (!this.table) {
      throw new Error("VectorMemoryStore not initialized. Call init() first.");
    }
    return this.table;
  }

  async store(text: string, tags?: string[]): Promise<MemoryEntry> {
    const table = this.ensureTable();
    const now = new Date().toISOString();
    const id = randomUUID();

    // Generate embedding for the text
    const vector = await getEmbedding(text, this.embeddingConfig);

    // Store in LanceDB
    const record = {
      id,
      vector,
      text,
      tags: tags ?? [],
      createdAt: now,
      updatedAt: now,
    };

    await table.add([record]);

    return {
      id,
      text,
      tags: tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
  }

  async recall(query: string, options?: RecallOptions): Promise<MemoryMatch[]> {
    const table = this.ensureTable();
    const limit = options?.limit ?? 5;

    // Generate embedding for the query
    const queryVector = await getEmbedding(query, this.embeddingConfig);

    // Build vector search query
    let searchQuery = table.vectorSearch(queryVector).limit(limit);

    // Add tag filter if provided
    if (options?.tags && options.tags.length > 0) {
      // LanceDB supports filtering with where clause
      const tagConditions = options.tags.map((tag) => `array_has(tags, '${tag}')`).join(" OR ");
      searchQuery = searchQuery.where(`(${tagConditions})`) as typeof searchQuery;
    }

    // Execute search - select needed columns including _distance for scoring
    const results = await searchQuery
      .select(["id", "text", "tags", "createdAt", "updatedAt", "_distance"])
      .toArray();

    // Map results to MemoryMatch[]
    const matches: MemoryMatch[] = [];

    for (const row of results) {
      const record = row as {
        id?: string;
        text?: string;
        tags?: unknown;
        createdAt?: string;
        updatedAt?: string;
        _distance?: number;
      };

      if (record.id && record.text) {
        // Convert distance to relevance score
        // LanceDB returns L2 distance by default; smaller = more similar
        // We convert to a 0-1 score where 1 = perfect match
        const distance = record._distance ?? 0;
        const relevanceScore = Math.max(0, 1 / (1 + distance));

        matches.push({
          entry: {
            id: record.id,
            text: record.text,
            tags: arrowToStringArray(record.tags),
            createdAt: record.createdAt ?? new Date().toISOString(),
            updatedAt: record.updatedAt ?? new Date().toISOString(),
          },
          relevanceScore,
          matchReason: "vector similarity",
        });
      }
    }

    return matches;
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const table = this.ensureTable();

    try {
      const results = await table.query()
        .where(`id = '${id}'`)
        .select(["id", "text", "tags", "createdAt", "updatedAt"])
        .limit(1)
        .toArray();

      if (results.length === 0) {
        return null;
      }

      const record = results[0] as {
        id?: string;
        text?: string;
        tags?: unknown;
        createdAt?: string;
        updatedAt?: string;
      };

      return {
        id: record.id ?? "",
        text: record.text ?? "",
        tags: arrowToStringArray(record.tags),
        createdAt: record.createdAt ?? new Date().toISOString(),
        updatedAt: record.updatedAt ?? new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  async list(): Promise<MemoryEntry[]> {
    const table = this.ensureTable();

    try {
      const results = await table.query()
        .select(["id", "text", "tags", "createdAt", "updatedAt"])
        .toArray();

      const entries: MemoryEntry[] = [];

      for (const row of results) {
        const record = row as {
          id?: string;
          text?: string;
          tags?: unknown;
          createdAt?: string;
          updatedAt?: string;
        };

        if (record.id && record.text) {
          entries.push({
            id: record.id,
            text: record.text,
            tags: arrowToStringArray(record.tags),
            createdAt: record.createdAt ?? new Date().toISOString(),
            updatedAt: record.updatedAt ?? new Date().toISOString(),
          });
        }
      }

      // Sort by createdAt descending
      entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return entries;
    } catch {
      return [];
    }
  }

  async delete(id: string): Promise<boolean> {
    const table = this.ensureTable();

    try {
      await table.delete(`id = '${id}'`);
      return true;
    } catch {
      return false;
    }
  }
}
