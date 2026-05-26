/**
 * No-op reranker - passthrough implementation that returns results unchanged.
 *
 * Used when reranking is disabled or as a fallback when reranking fails.
 */

import type { FusedResult } from "../fusion.js";
import type { Reranker, RerankResult, RerankOptions } from "./types.js";

/**
 * No-op reranker that passes through results without modification.
 *
 * Converts RRF scores to relevance scores (normalized to 0-1 range).
 * This is the default reranker when reranking is disabled.
 */
export class NoopReranker implements Reranker {
  readonly name = "noop";

  /**
   * Rerank by returning results with RRF scores as relevance scores.
   *
   * @param query - The search query (unused in no-op)
   * @param results - Results from RRF fusion
   * @param options - Rerank options
   * @returns Results with RRF scores normalized to 0-1
   */
  async rerank(
    query: string,
    results: FusedResult[],
    options?: RerankOptions
  ): Promise<RerankResult[]> {
    const topN = options?.topN ?? results.length;

    // Normalize RRF scores to 0-1 range
    // RRF scores are typically in range [0, 2/k] where k=60
    // For k=60, max score is ~0.033, so we scale accordingly
    const maxRrfScore = 2 / 60; // Maximum possible RRF score with k=60

    const reranked: RerankResult[] = results
      .slice(0, topN)
      .map((result) => ({
        chunkId: result.chunkId,
        text: result.text,
        // Normalize to 0-1, clamping to max 1.0
        relevanceScore: Math.min(result.rrfScore / maxRrfScore, 1.0),
        originalScore: result.rrfScore,
      }));

    // Apply minimum score filter if specified
    const minScore = options?.minScore;
    if (minScore !== undefined) {
      return reranked.filter((r) => r.relevanceScore >= minScore);
    }

    return reranked;
  }
}

/**
 * Default no-op reranker instance.
 */
export const noopReranker = new NoopReranker();
