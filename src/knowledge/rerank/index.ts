/**
 * Reranker module - provides reranking implementations for search results.
 *
 * Reranking improves retrieval quality by using cross-encoder models
 * to compute query-document relevance scores after initial retrieval.
 */

// Re-export types
export type {
  RerankResult,
  RerankOptions,
  Reranker,
  CohereRerankerConfig,
} from "./types.js";

// Re-export implementations
export { NoopReranker, noopReranker } from "./noop.js";
export { CohereReranker, createCohereReranker } from "./cohere.js";

import type { Reranker } from "./types.js";
import { noopReranker } from "./noop.js";
import { createCohereReranker } from "./cohere.js";

/**
 * Reranker provider types.
 */
export type RerankerProvider = "noop" | "cohere";

/**
 * Create a reranker based on configuration.
 *
 * @param provider - The reranker provider to use
 * @returns The reranker instance
 */
export function createReranker(provider: RerankerProvider = "noop"): Reranker {
  switch (provider) {
    case "cohere": {
      const cohereReranker = createCohereReranker();
      if (cohereReranker) {
        return cohereReranker;
      }
      console.warn("Cohere reranker requested but COHERE_API_KEY not set. Falling back to noop.");
      return noopReranker;
    }
    case "noop":
    default:
      return noopReranker;
  }
}

/**
 * Create a reranker from environment variables.
 *
 * Environment variables:
 * - RERANK_ENABLED: "true" to enable reranking (default: "false")
 * - RERANK_PROVIDER: "noop" or "cohere" (default: "noop")
 *
 * @returns The reranker instance
 */
export function createRerankerFromEnv(): Reranker {
  const enabled = process.env.RERANK_ENABLED === "true";

  if (!enabled) {
    return noopReranker;
  }

  const provider = (process.env.RERANK_PROVIDER as RerankerProvider) ?? "noop";
  return createReranker(provider);
}
