/**
 * File watcher for Obsidian vault integration.
 *
 * Monitors vault directory for changes and triggers incremental indexing.
 */

import * as chokidar from "chokidar";
import { stat, readdir } from "node:fs/promises";
import { join, extname, relative } from "node:path";
import type { VectorKnowledgeStore } from "./vector-store.js";

/**
 * Configuration for VaultWatcher.
 */
export interface VaultWatcherConfig {
  /** Path to Obsidian vault root */
  vaultPath: string;
  /** Vector knowledge store for indexing */
  store: VectorKnowledgeStore;
  /** Debounce interval in milliseconds (default: 1000ms) */
  debounceMs?: number;
}

/**
 * File watcher for Obsidian vault directories.
 *
 * Monitors Markdown files for changes and triggers incremental indexing.
 */
export class VaultWatcher {
  private readonly vaultPath: string;
  private readonly store: VectorKnowledgeStore;
  private readonly debounceMs: number;
  private watcher: chokidar.FSWatcher | null = null;
  private pendingUpdates: Map<string, NodeJS.Timeout> = new Map();
  private filesTracked: number = 0;

  constructor(config: VaultWatcherConfig) {
    this.vaultPath = config.vaultPath;
    this.store = config.store;
    this.debounceMs = config.debounceMs ?? 1000;
  }

  /**
   * Start watching the vault directory.
   */
  start(): void {
    if (this.watcher) {
      return; // Already watching
    }

    // Watch Markdown files, ignoring hidden directories
    this.watcher = chokidar.watch(
      [
        join(this.vaultPath, "**/*.md"),
        join(this.vaultPath, "**/*.markdown"),
      ],
      {
        ignored: [
          /(^|\/)\.[^/]+/, // Ignore hidden files and directories
          /(^|\/)\.obsidian/, // Ignore .obsidian directory
          /(^|\/)\.trash/, // Ignore .trash directory
          /(^|\/)\.git/, // Ignore .git directory
        ],
        persistent: true,
        ignoreInitial: true, // Don't trigger 'add' for existing files
        awaitWriteFinish: {
          stabilityThreshold: 500, // Wait for 500ms of stability
          pollInterval: 100,
        },
      }
    );

    // Event handlers
    this.watcher.on("add", (filePath: string) => {
      this.handleFileEvent(filePath, "add");
    });

    this.watcher.on("change", (filePath: string) => {
      this.handleFileEvent(filePath, "change");
    });

    this.watcher.on("unlink", (filePath: string) => {
      this.handleFileEvent(filePath, "unlink");
    });

    this.watcher.on("error", (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[VaultWatcher] Error: ${message}`);
    });

    // Count tracked files
    this.countTrackedFiles().then((count) => {
      this.filesTracked = count;
    });
  }

  /**
   * Stop watching the vault directory.
   */
  async stop(): Promise<void> {
    if (!this.watcher) {
      return;
    }

    // Clear all pending updates
    for (const timeout of this.pendingUpdates.values()) {
      clearTimeout(timeout);
    }
    this.pendingUpdates.clear();

    await this.watcher.close();
    this.watcher = null;
  }

  /**
   * Get current watcher status.
   */
  getStatus(): { watching: boolean; filesTracked: number } {
    return {
      watching: this.watcher !== null,
      filesTracked: this.filesTracked,
    };
  }

  /**
   * Handle file system event with debouncing.
   */
  private handleFileEvent(
    filePath: string,
    eventType: "add" | "change" | "unlink"
  ): void {
    // Clear any pending update for this file
    const pending = this.pendingUpdates.get(filePath);
    if (pending) {
      clearTimeout(pending);
    }

    // Set new debounced update
    const timeout = setTimeout(() => {
      this.pendingUpdates.delete(filePath);
      this.processFileEvent(filePath, eventType);
    }, this.debounceMs);

    this.pendingUpdates.set(filePath, timeout);
  }

  /**
   * Process the file system event after debouncing.
   */
  private async processFileEvent(
    filePath: string,
    eventType: "add" | "change" | "unlink"
  ): Promise<void> {
    try {
      switch (eventType) {
        case "add":
          await this.store.indexFile(filePath);
          this.filesTracked++;
          console.log(`[VaultWatcher] Indexed new file: ${relative(this.vaultPath, filePath)}`);
          break;

        case "change":
          await this.store.reindexFile(filePath);
          console.log(`[VaultWatcher] Reindexed modified file: ${relative(this.vaultPath, filePath)}`);
          break;

        case "unlink":
          await this.store.removeFile(filePath);
          this.filesTracked--;
          console.log(`[VaultWatcher] Removed deleted file: ${relative(this.vaultPath, filePath)}`);
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[VaultWatcher] Failed to process ${eventType} for ${filePath}: ${message}`);
    }
  }

  /**
   * Count Markdown files in vault.
   */
  private async countTrackedFiles(): Promise<number> {
    let count = 0;

    const scan = async (dir: string): Promise<void> => {
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        return;
      }

      for (const entry of entries) {
        // Skip hidden files and directories
        if (entry.startsWith(".")) {
          continue;
        }

        const fullPath = join(dir, entry);
        try {
          const fileStat = await stat(fullPath);

          if (fileStat.isDirectory()) {
            await scan(fullPath);
          } else if (fileStat.isFile()) {
            const ext = extname(entry).toLowerCase();
            if (ext === ".md" || ext === ".markdown") {
              count++;
            }
          }
        } catch {
          // Skip files we can't stat
          continue;
        }
      }
    };

    await scan(this.vaultPath);
    return count;
  }
}
