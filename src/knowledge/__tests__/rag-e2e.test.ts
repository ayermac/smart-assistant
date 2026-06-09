import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEmbedding } from "../../memory/embedding.js";
import { VectorKnowledgeStore } from "../vector-store.js";

function mockVector(text: string): number[] {
  const seed = Array.from(text).reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0);
  return Array.from({ length: 2048 }, (_, index) => ((seed + index) % 97) / 97);
}

vi.mock("../../memory/embedding.js", async () => {
  const actual = await vi.importActual<typeof import("../../memory/embedding.js")>(
    "../../memory/embedding.js"
  );

  return {
    ...actual,
    getEmbedding: vi.fn(async (text: string) => mockVector(text)),
  };
});

describe("VectorKnowledgeStore RAG integration", () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.mocked(getEmbedding).mockImplementation(async (text: string) => mockVector(text));
  });

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("indexes and searches a local markdown corpus without network access", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "smart-assistant-rag-"));
    tempDirs.push(tempDir);

    const sourceDir = join(tempDir, "knowledge");
    const dbPath = join(tempDir, "vectors");
    await mkdir(sourceDir, { recursive: true });
    await writeFile(
      join(sourceDir, "go.md"),
      [
        "# Go GMP",
        "",
        "GMP relies on P local run queues, work stealing, and CAS atomics for concurrency performance.",
      ].join("\n"),
      "utf8"
    );

    const store = new VectorKnowledgeStore({
      dbPath,
      sourceDir,
      embeddingConfig: {
        baseUrl: "https://example.com",
        model: "mock-embedding",
        apiKey: "test-key",
      },
    });
    await store.init();

    const manifest = await store.ingest();
    const matches = await store.search("GMP CAS atomics", { limit: 3 });

    expect(manifest.sources).toHaveLength(1);
    expect(manifest.chunks.length).toBeGreaterThan(0);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].chunk.sourcePath).toBe("go.md");
    expect(matches[0].chunk.headingText).toBe("Go GMP");
    expect(matches[0].chunk.text).toContain("CAS atomics");
  });

  it("queues watcher writes until an active search finishes", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "smart-assistant-rag-"));
    tempDirs.push(tempDir);

    const sourceDir = join(tempDir, "knowledge");
    const dbPath = join(tempDir, "vectors");
    await mkdir(sourceDir, { recursive: true });

    await writeFile(
      join(sourceDir, "go.md"),
      "# Go GMP\n\nGMP uses work stealing and local queues.",
      "utf8"
    );

    const store = new VectorKnowledgeStore({
      dbPath,
      sourceDir,
      embeddingConfig: {
        baseUrl: "https://example.com",
        model: "mock-embedding",
        apiKey: "test-key",
      },
    });
    await store.init();
    await store.ingest();

    const events: string[] = [];
    let releaseSearchEmbedding = () => {};
    const searchEmbeddingStarted = new Promise<void>((resolve) => {
      vi.mocked(getEmbedding).mockImplementation(async (text: string) => {
        if (text === "hold search") {
          events.push("search:embedding:start");
          resolve();
          await new Promise<void>((release) => {
            releaseSearchEmbedding = release;
          });
          events.push("search:embedding:end");
        }

        if (text.includes("write marker")) {
          events.push("write:embedding:start");
        }

        return mockVector(text);
      });
    });

    const search = store.search("hold search", { limit: 1 });
    await searchEmbeddingStarted;

    const newFile = join(sourceDir, "new.md");
    await writeFile(newFile, "# New\n\nwrite marker should wait for search.", "utf8");
    const write = store.indexFile(newFile);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(["search:embedding:start"]);

    releaseSearchEmbedding();

    await expect(search).resolves.toBeDefined();
    await expect(write).resolves.toBeUndefined();
    expect(events).toEqual([
      "search:embedding:start",
      "search:embedding:end",
      "write:embedding:start",
    ]);
  });
});
