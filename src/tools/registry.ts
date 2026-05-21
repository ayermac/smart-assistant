/**
 * Tool registry for smart-assistant.
 *
 * This module exports all available tools for the assistant.
 * Phase 2 includes get_time only.
 * Future phases will add remember, recall_memory, search_knowledge, create_plan, update_plan.
 */

import { get_time } from "./get_time.js";
import type { AgentTool } from "@earendil-works/pi-agent-core";

/**
 * Registry of all available tools for the assistant.
 *
 * Phase 2 includes get_time only.
 * Future phases will add:
 * - remember: Store long-term memory
 * - recall_memory: Retrieve relevant memories
 * - search_knowledge: Search local knowledge base
 * - create_plan: Create structured plan from goal
 * - update_plan: Update plan step status
 */
export const ALL_TOOLS: AgentTool[] = [get_time];
