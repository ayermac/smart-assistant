/**
 * File-based session store implementation.
 *
 * Persists sessions as JSON files in the sessions directory.
 * Uses atomic write pattern to prevent corruption.
 */

import { readFile, writeFile, rename, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { resolveDataPaths } from "../config.js";
import type { SessionFile, SessionMeta, SessionStore } from "./types.js";

/**
 * File-based implementation of SessionStore.
 */
export class FileSessionStore implements SessionStore {
  private readonly sessionsDir: string;

  constructor(sessionsDir?: string) {
    this.sessionsDir = sessionsDir ?? resolveDataPaths().sessions;
  }

  /**
   * Generate a timestamp-based session ID.
   * Format: YYYY-MM-DDTHH-MM-SS
   */
  private generateSessionId(): string {
    return new Date().toISOString().replace(/:/g, "-").slice(0, 19);
  }

  /**
   * Get the file path for a session ID.
   */
  private getSessionFilePath(sessionId: string): string {
    return join(this.sessionsDir, `session-${sessionId}.json`);
  }

  /**
   * Ensure the sessions directory exists.
   */
  private async ensureDir(): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true });
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

  create(): SessionFile {
    const now = new Date().toISOString();
    const id = this.generateSessionId();

    return {
      id,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
  }

  async load(sessionId: string): Promise<SessionFile | null> {
    const filePath = this.getSessionFilePath(sessionId);

    try {
      const content = await readFile(filePath, "utf8");
      return JSON.parse(content) as SessionFile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async save(sessionId: string, messages: AgentMessage[]): Promise<void> {
    const filePath = this.getSessionFilePath(sessionId);

    // Try to load existing session
    let session = await this.load(sessionId);

    if (!session) {
      // Create new session with the given ID
      const now = new Date().toISOString();
      session = {
        id: sessionId,
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
    }

    // Update messages and timestamp
    session.messages = [...messages]; // Copy array for immutability
    session.updatedAt = new Date().toISOString();

    await this.atomicWriteJson(filePath, session);
  }

  async list(): Promise<SessionMeta[]> {
    await this.ensureDir();

    let files: string[];
    try {
      files = await readdir(this.sessionsDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }

    const sessionFiles = files.filter((f) => f.startsWith("session-") && f.endsWith(".json"));

    const metas: SessionMeta[] = [];

    for (const file of sessionFiles) {
      const filePath = join(this.sessionsDir, file);
      try {
        const content = await readFile(filePath, "utf8");
        const session = JSON.parse(content) as SessionFile;
        metas.push({
          id: session.id,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messageCount: session.messages.length,
        });
      } catch {
        // Skip malformed session files
      }
    }

    // Sort by id descending (newest first, since IDs are timestamps)
    metas.sort((a, b) => b.id.localeCompare(a.id));

    return metas;
  }

  async getLatest(): Promise<SessionMeta | null> {
    const sessions = await this.list();
    return sessions.length > 0 ? sessions[0] ?? null : null;
  }
}
