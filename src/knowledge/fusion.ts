/**
 * RRF Fusion - combines vector and BM25 search results using Reciprocal Rank Fusion.
 *
 * RRF formula: score(chunk) = Σ 1/(k + rank_i)
 * Default k = 60
 */

import type { BM25Match } from "./bm25.js";

/**
 * A match result from vector similarity search.
 */
export interface VectorMatch {
  chunkId: string;
  text: string;
  score: number;
}

/**
 * A fused result combining vector and BM25 matches.
 */
export interface FusedResult {
  chunkId: string;
  text: string;
  rrfScore: number;
  vectorRank?: number;
  bm25Rank?: number;
}

/**
 * Options for RRF fusion.
 */
export interface FusionOptions {
  /** RRF constant k (default 60) */
  k?: number;
  /** Maximum number of results to return */
  topN?: number;
}

/**
 * Combine vector and BM25 search results using Reciprocal Rank Fusion.
 *
 * RRF score = sum of 1/(k + rank) for each list the chunk appears in.
 * Chunks appearing in both lists get higher combined scores.
 *
 * @param vectorResults - Results from vector similarity search
 * @param bm25Results - Results from BM25 keyword search
 * @param options - Fusion options (k, topN)
 * @returns Fused results sorted by RRF score (descending)
 */
export function rrfFusion(
  vectorResults: VectorMatch[],
  bm25Results: BM25Match[],
  options?: FusionOptions
): FusedResult[] {
  const k = options?.k ?? 60;
  const topN = options?.topN ?? 15;

  // Build rank maps (1-indexed)
  const vectorRanks = new Map<string, number>();
  const bm25Ranks = new Map<string, number>();
  const chunkTexts = new Map<string, string>();

  vectorResults.forEach((result, index) => {
    vectorRanks.set(result.chunkId, index + 1);
    chunkTexts.set(result.chunkId, result.text);
  });

  bm25Results.forEach((result, index) => {
    bm25Ranks.set(result.chunkId, index + 1);
    if (!chunkTexts.has(result.chunkId)) {
      chunkTexts.set(result.chunkId, result.text);
    }
  });

  // Collect all unique chunk IDs
  const allChunkIds = new Set<string>([
    ...vectorRanks.keys(),
    ...bm25Ranks.keys(),
  ]);

  // Calculate RRF scores
  const fused: FusedResult[] = [];

  for (const chunkId of allChunkIds) {
    let rrfScore = 0;
    let vectorRank: number | undefined;
    let bm25Rank: number | undefined;

    // Add vector contribution
    if (vectorRanks.has(chunkId)) {
      vectorRank = vectorRanks.get(chunkId)!;
      rrfScore += 1 / (k + vectorRank);
    }

    // Add BM25 contribution
    if (bm25Ranks.has(chunkId)) {
      bm25Rank = bm25Ranks.get(chunkId)!;
      rrfScore += 1 / (k + bm25Rank);
    }

    fused.push({
      chunkId,
      text: chunkTexts.get(chunkId) ?? "",
      rrfScore,
      vectorRank,
      bm25Rank,
    });
  }

  // Sort by RRF score descending and take topN
  fused.sort((a, b) => b.rrfScore - a.rrfScore);
  return fused.slice(0, topN);
}
