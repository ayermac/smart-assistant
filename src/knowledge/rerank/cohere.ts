/**
 * Cohere reranker - uses Cohere's rerank API for semantic relevance scoring.
 *
 * Cohere's rerank API uses cross-encoder models to compute query-document
 * relevance scores, providing more accurate ranking than bi-encoder models.
 */

import type { FusedResult } from "../fusion.js";
import type { Reranker, RerankResult, RerankOptions, CohereRerankerConfig } from "./types.js";

/**
 * Default Cohere rerank model.
 */
const DEFAULT_MODEL = "rerank-english-v3.0";

/**
 * Default Cohere API base URL.
 */
const DEFAULT_BASE_URL = "https://api.cohere.ai/v1";

/**
 * Cohere reranker implementation.
 *
 * Uses Cohere's rerank API to reorder search results based on semantic relevance.
 * Requires a Cohere API key.
 */
export class CohereReranker implements Reranker {
  readonly name = "cohere";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: CohereRerankerConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  /**
   * Rerank results using Cohere's rerank API.
   *
   * @param query - The search query
   * @param results - Results from RRF fusion
   * @param options - Rerank options
   * @returns Results reordered by semantic relevance
   */
  async rerank(
    query: string,
    results: FusedResult[],
    options?: RerankOptions
  ): Promise<RerankResult[]> {
    if (results.length === 0) {
      return [];
    }

    const topN = options?.topN ?? results.length;

    try {
      // Call Cohere rerank API
      const response = await fetch(`${this.baseUrl}/rerank`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          query,
          documents: results.map((r) => ({ text: r.text })),
          top_n: Math.min(topN, results.length),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cohere API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as CohereRerankResponse;

      // Map API results to RerankResult
      const reranked: RerankResult[] = data.results.map((result) => {
        const originalResult = results[result.index];
        return {
          chunkId: originalResult.chunkId,
          text: originalResult.text,
          relevanceScore: result.relevance_score,
          originalScore: originalResult.rrfScore,
        };
      });

      // Apply minimum score filter if specified
      if (options?.minScore !== undefined) {
        return reranked.filter((r) => r.relevanceScore >= options.minScore!);
      }

      return reranked;
    } catch (error) {
      // Log error and return results with original scores as fallback
      console.warn(`Cohere rerank failed: ${error}. Falling back to original order.`);
      return this.fallbackRerank(results, topN, options?.minScore);
    }
  }

  /**
   * Fallback reranking when API fails.
   * Returns results in original order with RRF scores normalized.
   */
  private fallbackRerank(
    results: FusedResult[],
    topN: number,
    minScore?: number
  ): RerankResult[] {
    const maxRrfScore = 2 / 60;

    const reranked = results
      .slice(0, topN)
      .map((result) => ({
        chunkId: result.chunkId,
        text: result.text,
        relevanceScore: Math.min(result.rrfScore / maxRrfScore, 1.0),
        originalScore: result.rrfScore,
      }));

    if (minScore !== undefined) {
      return reranked.filter((r) => r.relevanceScore >= minScore);
    }

    return reranked;
  }
}

/**
 * Cohere API response structure.
 */
interface CohereRerankResponse {
  results: Array<{
    index: number;
    relevance_score: number;
  }>;
}

/**
 * Create a Cohere reranker from environment variables.
 *
 * @returns Cohere reranker if API key is available, undefined otherwise
 */
export function createCohereReranker(): CohereReranker | undefined {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) {
    return undefined;
  }

  return new CohereReranker({
    apiKey,
    model: process.env.COHERE_RERANK_MODEL,
    baseUrl: process.env.COHERE_RERANK_BASE_URL,
  });
}
