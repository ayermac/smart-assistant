import { describe, expect, it } from "vitest";
import { createAllTools } from "../registry.js";
import type { MemoryEntry, MemoryMatch, MemoryStore } from "../../memory/types.js";

const memoryStore: MemoryStore = {
  async store(text: string, tags?: string[]): Promise<MemoryEntry> {
    return {
      id: "memory-1",
      text,
      tags: tags ?? [],
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:00.000Z",
    };
  },
  async recall(): Promise<MemoryMatch[]> {
    return [];
  },
  async get(): Promise<MemoryEntry | null> {
    return null;
  },
  async list(): Promise<MemoryEntry[]> {
    return [];
  },
  async delete(): Promise<boolean> {
    return false;
  },
};

describe("createAllTools", () => {
  it("does not expose mock_failure by default", () => {
    const toolNames = createAllTools(memoryStore).map((tool) => tool.name);

    expect(toolNames).toContain("get_time");
    expect(toolNames).toContain("remember");
    expect(toolNames).toContain("recall_memory");
    expect(toolNames).not.toContain("mock_failure");
  });

  it("exposes mock_failure only when test tools are enabled", () => {
    const toolNames = createAllTools(memoryStore, undefined, undefined, {
      includeTestTools: true,
    }).map((tool) => tool.name);

    expect(toolNames).toContain("mock_failure");
  });
});
