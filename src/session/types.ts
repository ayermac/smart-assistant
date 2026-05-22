/**
 * Session types - defines interfaces for session persistence.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";

/**
 * Represents a persisted session file.
 */
export interface SessionFile {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessage[];
}

/**
 * Metadata about a session, without the full message content.
 */
export interface SessionMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

/**
 * Interface for session persistence operations.
 */
export interface SessionStore {
  /** Create a new session with a timestamp-based ID. */
  create(): SessionFile;

  /** Load a session by ID, returns null if not found. */
  load(sessionId: string): SessionFile | null;

  /** Save messages to an existing session. */
  save(sessionId: string, messages: AgentMessage[]): void;

  /** List all sessions sorted by timestamp (newest first). */
  list(): SessionMeta[];

  /** Get the latest session, or null if none exist. */
  getLatest(): SessionMeta | null;
}
