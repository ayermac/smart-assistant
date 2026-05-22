/**
 * Memory tools - remember and recall_memory.
 *
 * Factory functions that create tools with injected MemoryStore.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { MemoryStore } from "../memory/types.js";

/**
 * Parameters schema for remember tool.
 */
const RememberParameters = Type.Object({
  text: Type.String({
    description: "The fact or preference to remember",
  }),
  tags: Type.Optional(
    Type.Array(Type.String(), {
      description: "Optional tags for categorization",
    })
  ),
});

type RememberParams = Static<typeof RememberParameters>;

/**
 * Tool result details for remember.
 */
interface RememberDetails {
  id: string;
  text: string;
  tags: string[];
  createdAt: string;
}

/**
 * Create the remember tool with injected MemoryStore.
 */
export function createRememberTool(
  store: MemoryStore
): AgentTool<typeof RememberParameters, RememberDetails> {
  return {
    name: "remember",
    description: "Store a long-term fact or preference for later recall",
    label: "Remember",
    parameters: RememberParameters,

    async execute(toolCallId, params, signal, onUpdate) {
      const entry = await store.store(params.text, params.tags);

      return {
        content: [
          {
            type: "text",
            text: `Remembered: "${params.text}" (id: ${entry.id})`,
          },
        ],
        details: {
          id: entry.id,
          text: entry.text,
          tags: entry.tags,
          createdAt: entry.createdAt,
        },
      };
    },
  };
}

/**
 * Parameters schema for recall_memory tool.
 */
const RecallMemoryParameters = Type.Object({
  query: Type.String({
    description: "Search query to find relevant memories",
  }),
  tags: Type.Optional(
    Type.Array(Type.String(), {
      description: "Filter by specific tags",
    })
  ),
  limit: Type.Optional(
    Type.Number({
      minimum: 1,
      maximum: 20,
      description: "Maximum number of memories to return (default: 5)",
    })
  ),
});

type RecallMemoryParams = Static<typeof RecallMemoryParameters>;

/**
 * Tool result details for recall_memory.
 */
interface RecallMemoryDetails {
  memories: Array<{
    id: string;
    text: string;
    tags: string[];
    relevanceScore: number;
    matchReason: string;
  }>;
  total: number;
}

/**
 * Create the recall_memory tool with injected MemoryStore.
 */
export function createRecallMemoryTool(
  store: MemoryStore
): AgentTool<typeof RecallMemoryParameters, RecallMemoryDetails> {
  return {
    name: "recall_memory",
    description: "Retrieve relevant long-term memories for a query",
    label: "Recall Memory",
    parameters: RecallMemoryParameters,

    async execute(toolCallId, params, signal, onUpdate) {
      const matches = await store.recall(params.query, {
        tags: params.tags,
        limit: params.limit,
      });

      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No memories found matching your query.",
            },
          ],
          details: {
            memories: [],
            total: 0,
          },
        };
      }

      const summary = matches
        .map(
          (m) =>
            `- "${m.entry.text}" (relevance: ${m.relevanceScore}, ${m.matchReason})`
        )
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${matches.length} memory(ies):\n${summary}`,
          },
        ],
        details: {
          memories: matches.map((m) => ({
            id: m.entry.id,
            text: m.entry.text,
            tags: m.entry.tags,
            relevanceScore: m.relevanceScore,
            matchReason: m.matchReason,
          })),
          total: matches.length,
        },
      };
    },
  };
}
