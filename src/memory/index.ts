/**
 * Memory module - long-term memory persistence.
 */

export type {
  MemoryEntry,
  MemoryMatch,
  RecallOptions,
  MemoryStore,
} from "./types.js";

export { FileMemoryStore } from "./store.js";
export { VectorMemoryStore } from "./vector-store.js";
export { getEmbedding, createDefaultEmbeddingConfig, type EmbeddingConfig } from "./embedding.js";
