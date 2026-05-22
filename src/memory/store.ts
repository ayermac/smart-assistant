/**
 * File-based memory store implementation.
 *
 * Persists memories as JSON files in the memories directory.
 * Uses atomic write pattern to prevent corruption.
 */

import { readFile, writeFile, rename, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { resolveDataPaths } from "../config.js";
import type { MemoryEntry, MemoryMatch, MemoryStore, RecallOptions } from "./types.js";

/**
 * File-based implementation of MemoryStore.
 */
export class FileMemoryStore implements MemoryStore {
  private readonly memoriesDir: string;

  constructor(memoriesDir?: string) {
    this.memoriesDir = memoriesDir ?? resolveDataPaths().memory;
  }

  /**
   * Get the file path for a memory ID.
   */
  private getMemoryFilePath(id: string): string {
    return join(this.memoriesDir, `memory-${id}.json`);
  }

  /**
   * Ensure the memories directory exists.
   */
  private async ensureDir(): Promise<void> {
    await mkdir(this.memoriesDir, { recursive: true });
  }

  /**
   * Atomically write JSON to a file.
   * Writes to a temp file first, then renames to prevent corruption.
   */
  private async atomicWriteJson(filePath: string, data: unknown): Promise<void> {
    await this.ensureDir();

    const tempPath = `${filePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
    await rename(tempPath, filePath);
  }

  async store(text: string, tags?: string[]): Promise<MemoryEntry> {
    const now = new Date().toISOString();
    const id = randomUUID();

    const entry: MemoryEntry = {
      id,
      text,
      tags: tags ?? [],
      createdAt: now,
      updatedAt: now,
    };

    const filePath = this.getMemoryFilePath(id);
    await this.atomicWriteJson(filePath, entry);

    return entry;
  }

  async recall(query: string, options?: RecallOptions): Promise<MemoryMatch[]> {
    const memories = await this.list();
    const limit = options?.limit ?? 5;
    const tagFilter = options?.tags;

    // Step 1: Filter by tags if provided
    let candidates = memories;
    if (tagFilter && tagFilter.length > 0) {
      candidates = memories.filter((m) =>
        tagFilter.some((tag) => m.tags.includes(tag))
      );
    }

    // Step 2: Expand query with semantic equivalents
    const queryLower = query.toLowerCase();
    const expandedQueries = this.expandQuery(queryLower);

    // Step 3: Score by keyword match
    const matches: MemoryMatch[] = [];

    for (const entry of candidates) {
      const textLower = entry.text.toLowerCase();
      let score = 0;
      const reasons: string[] = [];

      // Check each expanded query variant
      for (const expandedQuery of expandedQueries) {
        // Check for substring match
        if (textLower.includes(expandedQuery)) {
          score += 10;
          reasons.push("text match");
        }

        // Check for word overlap
        const queryWords = expandedQuery.split(/\s+/);
        const textWords = textLower.split(/\s+/);
        const wordOverlap = queryWords.filter((w) => textWords.includes(w)).length;
        if (wordOverlap > 0) {
          score += wordOverlap;
          reasons.push(`${wordOverlap} word(s) matched`);
        }

        // Check for tag overlap
        const tagOverlap = entry.tags.filter((t) =>
          expandedQuery.includes(t.toLowerCase())
        ).length;
        if (tagOverlap > 0) {
          score += tagOverlap * 2;
          reasons.push("tag match");
        }
      }

      if (score > 0) {
        matches.push({
          entry,
          relevanceScore: score,
          matchReason: reasons.join(", "),
        });
      }
    }

    // Step 4: Sort by score descending, return top N
    matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return matches.slice(0, limit);
  }

  /**
   * Expand query with semantic equivalents for better matching.
   * Uses general synonym expansion rather than hardcoded patterns.
   */
  private expandQuery(query: string): string[] {
    const expansions: string[] = [query];

    // General synonym groups for common query concepts
    // Each group contains words that are semantically related
    const synonymGroups = [
      // Identity/Name related
      ["名字", "称呼", "叫什么", "是谁", "身份", "谁"],
      // Self-reference
      ["你", "助手", "自己"],
      // Preference related
      ["喜欢", "偏好", "爱好", "最爱"],
      // Time related
      ["时间", "时候", "日期"],
      // Location related
      ["在哪", "位置", "地点", "地址"],
    ];

    // Find which synonym groups the query intersects with
    for (const group of synonymGroups) {
      const hasMatch = group.some((word) => query.includes(word));
      if (hasMatch) {
        // Add all words from this group as potential matches
        expansions.push(...group);
      }
    }

    // Also add individual words from query (for partial matching)
    const words = query.split(/\s+/).filter((w) => w.length > 1);
    expansions.push(...words);

    return [...new Set(expansions)]; // Dedupe
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const filePath = this.getMemoryFilePath(id);

    try {
      const content = await readFile(filePath, "utf8");
      return JSON.parse(content) as MemoryEntry;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async list(): Promise<MemoryEntry[]> {
    await this.ensureDir();

    let files: string[];
    try {
      files = await readdir(this.memoriesDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }

    const memoryFiles = files.filter(
      (f) => f.startsWith("memory-") && f.endsWith(".json")
    );

    const entries: MemoryEntry[] = [];

    for (const file of memoryFiles) {
      const filePath = join(this.memoriesDir, file);
      try {
        const content = await readFile(filePath, "utf8");
        const entry = JSON.parse(content) as MemoryEntry;
        entries.push(entry);
      } catch {
        // Skip malformed memory files
      }
    }

    // Sort by createdAt descending (newest first)
    entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return entries;
  }

  async delete(id: string): Promise<boolean> {
    const filePath = this.getMemoryFilePath(id);

    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }
}
