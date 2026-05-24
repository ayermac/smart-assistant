/**
 * Knowledge module - re-exports all knowledge types and interfaces.
 */

export type {
  KnowledgeChunk,
  KnowledgeMatch,
  SearchOptions,
  ChunkMetadata,
  SourceMetadata,
  KnowledgeManifest,
  KnowledgeStore,
  ImageReference,
} from "./types.js";

export { FileKnowledgeStore, type FileKnowledgeStoreConfig } from "./store.js";
export { VectorKnowledgeStore, type VectorKnowledgeStoreConfig } from "./vector-store.js";
export { chunkFile, SUPPORTED_EXTENSIONS, isSupportedExtension, type ChunkOptions } from "./chunker.js";
export { cleanText, extractFrontmatter } from "./cleaner.js";
export { BM25Retriever, type BM25Match } from "./bm25.js";
export { rrfFusion, type VectorMatch, type FusedResult, type FusionOptions } from "./fusion.js";
