/**
 * Tests for reranker module.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NoopReranker, noopReranker } from "../rerank/noop.js";
import { CohereReranker, createCohereReranker } from "../rerank/cohere.js";
import { createReranker, createRerankerFromEnv } from "../rerank/index.js";
import type { FusedResult } from "../fusion.js";

// Mock FusedResult data
const mockResults: FusedResult[] = [
  { chunkId: "chunk-1", text: "This is about machine learning", rrfScore: 0.033, vectorRank: 1, bm25Rank: 2 },
  { chunkId: "chunk-2", text: "This is about deep learning", rrfScore: 0.028, vectorRank: 2, bm25Rank: 3 },
  { chunkId: "chunk-3", text: "This is about neural networks", rrfScore: 0.025, vectorRank: 3, bm25Rank: 1 },
];

describe("NoopReranker", () => {
  it("should return results with normalized scores", async () => {
    const reranker = new NoopReranker();
    const results = await reranker.rerank("machine learning", mockResults);

    expect(results).toHaveLength(3);
    expect(results[0].chunkId).toBe("chunk-1");
    expect(results[0].relevanceScore).toBeGreaterThan(0);
    expect(results[0].relevanceScore).toBeLessThanOrEqual(1);
    expect(results[0].originalScore).toBe(0.033);
  });

  it("should respect topN option", async () => {
    const reranker = new NoopReranker();
    const results = await reranker.rerank("machine learning", mockResults, { topN: 2 });

    expect(results).toHaveLength(2);
  });

  it("should apply minScore filter", async () => {
    const reranker = new NoopReranker();
    const results = await reranker.rerank("machine learning", mockResults, { minScore: 0.9 });

    // Only the highest score should pass
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("should handle empty results", async () => {
    const reranker = new NoopReranker();
    const results = await reranker.rerank("query", []);

    expect(results).toHaveLength(0);
  });

  it("should have correct name", () => {
    const reranker = new NoopReranker();
    expect(reranker.name).toBe("noop");
  });
});

describe("noopReranker instance", () => {
  it("should be a NoopReranker instance", () => {
    expect(noopReranker).toBeInstanceOf(NoopReranker);
  });
});

describe("CohereReranker", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("COHERE_API_KEY", undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("should call Cohere API and return reranked results", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { index: 2, relevance_score: 0.95 },
          { index: 0, relevance_score: 0.85 },
          { index: 1, relevance_score: 0.75 },
        ],
      }),
    });
    global.fetch = mockFetch;

    const reranker = new CohereReranker({ apiKey: "test-key" });
    const results = await reranker.rerank("machine learning", mockResults);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.cohere.ai/v1/rerank",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      })
    );

    expect(results).toHaveLength(3);
    expect(results[0].chunkId).toBe("chunk-3"); // index 2
    expect(results[0].relevanceScore).toBe(0.95);
    expect(results[1].chunkId).toBe("chunk-1"); // index 0
    expect(results[1].relevanceScore).toBe(0.85);
  });

  it("should fallback to original order on API error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });
    global.fetch = mockFetch;

    const reranker = new CohereReranker({ apiKey: "test-key" });
    const results = await reranker.rerank("machine learning", mockResults);

    // Should return results in original order with normalized RRF scores
    expect(results).toHaveLength(3);
    expect(results[0].chunkId).toBe("chunk-1");
    expect(results[0].relevanceScore).toBeGreaterThan(0);
  });

  it("should handle empty results", async () => {
    const reranker = new CohereReranker({ apiKey: "test-key" });
    const results = await reranker.rerank("query", []);

    expect(results).toHaveLength(0);
  });

  it("should have correct name", () => {
    const reranker = new CohereReranker({ apiKey: "test-key" });
    expect(reranker.name).toBe("cohere");
  });

  it("should use custom model and base URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    global.fetch = mockFetch;

    const reranker = new CohereReranker({
      apiKey: "test-key",
      model: "custom-model",
      baseUrl: "https://custom.api/v1",
    });
    await reranker.rerank("query", mockResults);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://custom.api/v1/rerank",
      expect.objectContaining({
        body: expect.stringContaining("custom-model"),
      })
    );
  });
});

describe("createCohereReranker", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should return undefined when COHERE_API_KEY is not set", () => {
    vi.stubEnv("COHERE_API_KEY", undefined);
    expect(createCohereReranker()).toBeUndefined();
  });

  it("should return CohereReranker when COHERE_API_KEY is set", () => {
    vi.stubEnv("COHERE_API_KEY", "test-api-key");
    const reranker = createCohereReranker();

    expect(reranker).toBeInstanceOf(CohereReranker);
  });
});

describe("createReranker", () => {
  it("should return NoopReranker for 'noop' provider", () => {
    const reranker = createReranker("noop");
    expect(reranker).toBeInstanceOf(NoopReranker);
  });

  it("should return NoopReranker by default", () => {
    const reranker = createReranker();
    expect(reranker).toBeInstanceOf(NoopReranker);
  });
});

describe("createRerankerFromEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should return NoopReranker when RERANK_ENABLED is not set", () => {
    vi.stubEnv("RERANK_ENABLED", undefined);
    const reranker = createRerankerFromEnv();

    expect(reranker).toBeInstanceOf(NoopReranker);
  });

  it("should return NoopReranker when RERANK_ENABLED is false", () => {
    vi.stubEnv("RERANK_ENABLED", "false");
    const reranker = createRerankerFromEnv();

    expect(reranker).toBeInstanceOf(NoopReranker);
  });

  it("should return NoopReranker when RERANK_ENABLED is true but provider is noop", () => {
    vi.stubEnv("RERANK_ENABLED", "true");
    vi.stubEnv("RERANK_PROVIDER", "noop");
    const reranker = createRerankerFromEnv();

    expect(reranker).toBeInstanceOf(NoopReranker);
  });

  it("should return CohereReranker when enabled with cohere provider and API key", () => {
    vi.stubEnv("RERANK_ENABLED", "true");
    vi.stubEnv("RERANK_PROVIDER", "cohere");
    vi.stubEnv("COHERE_API_KEY", "test-key");
    const reranker = createRerankerFromEnv();

    expect(reranker).toBeInstanceOf(CohereReranker);
  });

  it("should fallback to NoopReranker when cohere requested but no API key", () => {
    vi.stubEnv("RERANK_ENABLED", "true");
    vi.stubEnv("RERANK_PROVIDER", "cohere");
    vi.stubEnv("COHERE_API_KEY", undefined);
    const reranker = createRerankerFromEnv();

    expect(reranker).toBeInstanceOf(NoopReranker);
  });
});
