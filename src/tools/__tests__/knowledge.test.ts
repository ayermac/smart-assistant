import { describe, expect, it, vi } from "vitest";
import { createSearchKnowledgeTool } from "../knowledge.js";
import type {
  KnowledgeChunk,
  KnowledgeManifest,
  KnowledgeMatch,
  KnowledgeStore,
  SearchOptions,
} from "../../knowledge/types.js";

function createStore(overrides?: Partial<KnowledgeStore>): KnowledgeStore {
  const chunk: KnowledgeChunk = {
    id: "chunk-1",
    sourcePath: "notes.md",
    headingLevel: 1,
    headingText: "Notes",
    text: "GMP scheduler notes",
    startLine: 1,
    endLine: 1,
    tags: [],
    createdAt: "2026-06-09T00:00:00.000Z",
  };

  const manifest: KnowledgeManifest = {
    version: 1,
    lastIndexed: "2026-06-09T00:00:00.000Z",
    sourceDir: "/tmp/knowledge",
    chunks: [],
    sources: [],
  };

  const match: KnowledgeMatch = {
    chunk,
    relevanceScore: 0.9,
    matchReason: "test",
  };

  return {
    async ingest() {
      return manifest;
    },
    async search() {
      return [match];
    },
    async getManifest() {
      return manifest;
    },
    async needsReindex() {
      return false;
    },
    async getChunk() {
      return chunk;
    },
    async listChunks() {
      return [];
    },
    ...overrides,
  };
}

function updateText(update: unknown): string {
  const content = (update as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
  return content.map((item) => item.text ?? "").join("\n");
}

describe("createSearchKnowledgeTool", () => {
  it("passes an abort signal to knowledge search and streams progress updates", async () => {
    let receivedOptions: SearchOptions | undefined;
    const search = vi.fn(async (_query: string, options?: SearchOptions) => {
      receivedOptions = options;
      return [];
    });
    const tool = createSearchKnowledgeTool(createStore({ search }), { timeoutMs: 100 });
    const updates: string[] = [];

    await tool.execute("call-1", { query: "golang" }, undefined, (update) => {
      updates.push(updateText(update));
    });

    expect(search).toHaveBeenCalled();
    expect(receivedOptions?.signal).toBeInstanceOf(AbortSignal);
    expect(updates).toContain("Checking knowledge index...");
    expect(updates).toContain("Searching knowledge base...");
  });

  it("returns a timeout result when search does not settle", async () => {
    const search = vi.fn(
      () => new Promise<KnowledgeMatch[]>(() => {
        // Intentionally never resolves.
      })
    );
    const tool = createSearchKnowledgeTool(createStore({ search }), { timeoutMs: 5 });

    const result = await tool.execute("call-1", { query: "golang" }, undefined);
    const text = updateText(result);

    expect(text).toContain("Failed to search knowledge base");
    expect(text).toContain("timed out");
  });
});
