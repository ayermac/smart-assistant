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
} from "./types.js";

export { FileKnowledgeStore, type FileKnowledgeStoreConfig } from "./store.js";
export { VectorKnowledgeStore, type VectorKnowledgeStoreConfig } from "./vector-store.js";
export { chunkFile, SUPPORTED_EXTENSIONS, isSupportedExtension } from "./chunker.js";
