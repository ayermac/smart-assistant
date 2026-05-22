/**
 * Tool registry for smart-assistant.
 *
 * This module exports all available tools for the assistant.
 * Phase 4 adds memory tools (remember, recall_memory).
 * Phase 5 adds knowledge tool (search_knowledge).
 */

import { get_time } from "./get_time.js";
import {
  createRememberTool,
  createRecallMemoryTool,
} from "./memory.js";
import { createSearchKnowledgeTool } from "./knowledge.js";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { MemoryStore } from "../memory/types.js";
import type { KnowledgeStore } from "../knowledge/types.js";

/**
 * Create all tools with injected dependencies.
 *
 * @param memoryStore - Memory store for remember/recall operations
 * @param knowledgeStore - Optional knowledge store for search_knowledge operations
 * @returns Array of all available tools
 */
export function createAllTools(
  memoryStore: MemoryStore,
  knowledgeStore?: KnowledgeStore
): AgentTool[] {
  const tools: AgentTool[] = [
    get_time,
    createRememberTool(memoryStore),
    createRecallMemoryTool(memoryStore),
  ];

  // Add knowledge tool only when knowledgeStore is provided
  if (knowledgeStore) {
    tools.push(createSearchKnowledgeTool(knowledgeStore));
  }

  return tools;
}

/**
 * Registry of all available tools for the assistant (without memory).
 *
 * This is kept for backward compatibility and for phases that don't need memory.
 * Phase 2 includes get_time only.
 */
export const ALL_TOOLS: AgentTool[] = [get_time];
