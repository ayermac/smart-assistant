/**
 * Vector-based memory store using ChromaDB and Doubao embeddings.
 *
 * Provides semantic search for long-term memory using vector similarity.
 */

import { ChromaClient, Collection } from "chromadb";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getEmbedding, type EmbeddingConfig } from "./embedding.js";
import type { MemoryEntry, MemoryMatch, MemoryStore, RecallOptions } from "./types.js";

/**
 * Vector-based implementation of MemoryStore using ChromaDB.
 */
export class VectorMemoryStore implements MemoryStore {
  private readonly embeddingConfig: EmbeddingConfig;
  private readonly chromaPath: string;
  private client: ChromaClient | null = null;
  private collection: Collection | null = null;

  constructor(config: EmbeddingConfig, chromaPath?: string) {
    this.embeddingConfig = config;
    this.chromaPath = chromaPath ?? ".smart-assistant/chroma";
  }

  /**
   * Initialize the ChromaDB client and create the memories collection.
   * Must be called before any other operations.
   */
  async init(): Promise<void> {
    this.client = new ChromaClient({ path: this.chromaPath });
    this.collection = await this.client.getOrCreateCollection({
      name: "memories",
      metadata: { description: "Long-term memory storage with vector search" },
    });
  }

  private ensureCollection(): Collection {
    if (!this.collection) {
      throw new Error("VectorMemoryStore not initialized. Call init() first.");
    }
    return this.collection;
  }

  async store(text: string, tags?: string[]): Promise<MemoryEntry> {
    const collection = this.ensureCollection();
    const now = new Date().toISOString();
    const id = randomUUID();

    // Generate embedding for the text
    const embedding = await getEmbedding(text, this.embeddingConfig);

    // Store in ChromaDB
    await collection.add({
      ids: [id],
      embeddings: [embedding],
      documents: [text],
      metadatas: [
        {
          tags: tags ?? [],
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    return {
      id,
      text,
      tags: tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
  }

  async recall(query: string, options?: RecallOptions): Promise<MemoryMatch[]> {
    const collection = this.ensureCollection();
    const limit = options?.limit ?? 5;

    // Generate embedding for the query
    const queryEmbedding = await getEmbedding(query, this.embeddingConfig);

    // Build where clause for tag filtering
    const where = options?.tags && options.tags.length > 0
      ? { tags: { $contains: options.tags[0] } } // ChromaDB limitation: single tag filter
      : undefined;

    // Query ChromaDB
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit,
      where,
      include: ["documents", "metadatas", "distances"],
    });

    // Map results to MemoryMatch[]
    const matches: MemoryMatch[] = [];
    const documents = results.documents[0] ?? [];
    const metadatas = results.metadatas[0] ?? [];
    const distances = results.distances[0] ?? [];
    const ids = results.ids[0] ?? [];

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const meta = metadatas[i] as { tags?: string[]; createdAt?: string; updatedAt?: string } | null;
      const distance = distances[i] ?? 0;
      const id = ids[i];

      if (doc !== null && id) {
        // Convert distance to relevance score (1 - distance for cosine similarity)
        const relevanceScore = Math.max(0, 1 - distance);

        matches.push({
          entry: {
            id,
            text: doc,
            tags: meta?.tags ?? [],
            createdAt: meta?.createdAt ?? new Date().toISOString(),
            updatedAt: meta?.updatedAt ?? new Date().toISOString(),
          },
          relevanceScore,
          matchReason: "vector similarity",
        });
      }
    }

    return matches;
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const collection = this.ensureCollection();

    try {
      const results = await collection.get({
        ids: [id],
        include: ["documents", "metadatas"],
      });

      const doc = results.documents[0];
      const meta = results.metadatas[0] as { tags?: string[]; createdAt?: string; updatedAt?: string } | null;

      if (doc === null) {
        return null;
      }

      return {
        id,
        text: doc,
        tags: meta?.tags ?? [],
        createdAt: meta?.createdAt ?? new Date().toISOString(),
        updatedAt: meta?.updatedAt ?? new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  async list(): Promise<MemoryEntry[]> {
    const collection = this.ensureCollection();

    // Get all entries
    const results = await collection.get({
      include: ["documents", "metadatas"],
    });

    const entries: MemoryEntry[] = [];
    const documents = results.documents;
    const metadatas = results.metadatas;
    const ids = results.ids;

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const meta = metadatas[i] as { tags?: string[]; createdAt?: string; updatedAt?: string } | null;
      const id = ids[i];

      if (doc !== null && id) {
        entries.push({
          id,
          text: doc,
          tags: meta?.tags ?? [],
          createdAt: meta?.createdAt ?? new Date().toISOString(),
          updatedAt: meta?.updatedAt ?? new Date().toISOString(),
        });
      }
    }

    // Sort by createdAt descending
    entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return entries;
  }

  async delete(id: string): Promise<boolean> {
    const collection = this.ensureCollection();

    try {
      await collection.delete({ ids: [id] });
      return true;
    } catch {
      return false;
    }
  }
}
