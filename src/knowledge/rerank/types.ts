/**
 * Reranker types - defines interfaces for reranking search results.
 *
 * Reranking improves retrieval relevance by using a cross-encoder model
 * to compute query-document relevance scores after initial retrieval.
 */

import type { FusedResult } from "../fusion.js";

/**
 * A reranked result with normalized relevance score.
 */
export interface RerankResult {
  chunkId: string;
  text: string;
  /** Normalized relevance score (0-1) */
  relevanceScore: number;
  /** Original RRF score (if applicable) */
  originalScore?: number;
}

/**
 * Options for reranking.
 */
export interface RerankOptions {
  /** Maximum number of results to return after reranking */
  topN?: number;
  /** Minimum relevance score threshold (0-1) */
  minScore?: number;
  /** Abort signal for cancelling network-backed rerankers */
  signal?: AbortSignal;
}

/**
 * Interface for reranking search results.
 *
 * Rerankers take candidate results from initial retrieval (e.g., RRF fusion)
 * and reorder them based on semantic relevance to the query.
 */
export interface Reranker {
  /** Rerank candidate results based on query relevance */
  rerank(
    query: string,
    results: FusedResult[],
    options?: RerankOptions
  ): Promise<RerankResult[]>;

  /** Get the name of this reranker for logging/debugging */
  readonly name: string;
}

/**
 * Configuration for Cohere reranker.
 */
export interface CohereRerankerConfig {
  /** Cohere API key */
  apiKey: string;
  /** Model to use (default: "rerank-english-v3.0") */
  model?: string;
  /** Base URL for API (default: Cohere's API) */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}
