import { afterEach, describe, expect, it, vi } from "vitest";
import { getEmbedding, type EmbeddingConfig } from "../embedding.js";

const config: EmbeddingConfig = {
  baseUrl: "https://example.com/api",
  model: "test-embedding",
  apiKey: "test-key",
};

describe("getEmbedding", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("passes abort signals to fetch", async () => {
    const controller = new AbortController();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      }),
    });
    global.fetch = mockFetch;

    await getEmbedding("hello", config, {
      signal: controller.signal,
      timeoutMs: 0,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/api/embeddings",
      expect.objectContaining({
        signal: controller.signal,
      })
    );
  });

  it("rejects before fetch when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    await expect(
      getEmbedding("hello", config, {
        signal: controller.signal,
        timeoutMs: 0,
      })
    ).rejects.toThrow();

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
