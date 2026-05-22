/**
 * Tool registry for smart-assistant.
 *
 * This module exports all available tools for the assistant.
 * Phase 4 adds memory tools (remember, recall_memory).
 */

import { get_time } from "./get_time.js";
import {
  createRememberTool,
  createRecallMemoryTool,
} from "./memory.js";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { MemoryStore } from "../memory/types.js";

/**
 * Create all tools with injected dependencies.
 *
 * @param memoryStore - Memory store for remember/recall operations
 * @returns Array of all available tools
 */
export function createAllTools(memoryStore: MemoryStore): AgentTool[] {
  return [
    get_time,
    createRememberTool(memoryStore),
    createRecallMemoryTool(memoryStore),
  ];
}

/**
 * Registry of all available tools for the assistant (without memory).
 *
 * This is kept for backward compatibility and for phases that don't need memory.
 * Phase 2 includes get_time only.
 */
export const ALL_TOOLS: AgentTool[] = [get_time];
