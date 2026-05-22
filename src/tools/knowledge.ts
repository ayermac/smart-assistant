/**
 * Knowledge tools - search_knowledge.
 *
 * Factory function that creates tool with injected KnowledgeStore.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { KnowledgeStore } from "../knowledge/types.js";

/**
 * Parameters schema for search_knowledge tool.
 */
const SearchKnowledgeParameters = Type.Object({
  query: Type.String({
    description: "Search query to find relevant knowledge",
  }),
  limit: Type.Optional(
    Type.Number({
      minimum: 1,
      maximum: 20,
      description: "Maximum number of results to return (default: 5)",
    })
  ),
  tags: Type.Optional(
    Type.Array(Type.String(), {
      description: "Filter by specific tags",
    })
  ),
});

type SearchKnowledgeParams = Static<typeof SearchKnowledgeParameters>;

/**
 * Tool result details for search_knowledge.
 */
interface SearchKnowledgeDetails {
  results: Array<{
    id: string;
    sourcePath: string;
    headingText: string;
    snippet: string;
    relevanceScore: number;
    matchReason: string;
  }>;
  total: number;
  fromCache: boolean;
}

/**
 * Create the search_knowledge tool with injected KnowledgeStore.
 */
export function createSearchKnowledgeTool(
  store: KnowledgeStore
): AgentTool<typeof SearchKnowledgeParameters, SearchKnowledgeDetails> {
  return {
    name: "search_knowledge",
    description:
      "Search local Markdown/text knowledge base for relevant information. Returns results with source citations.",
    label: "Search Knowledge",
    parameters: SearchKnowledgeParameters,

    async execute(toolCallId, params, signal, onUpdate) {
      try {
        // Check if ingestion is needed and trigger it
        if (await store.needsReindex()) {
          // Stream progress update
          onUpdate?.({
            content: [
              {
                type: "text",
                text: "Indexing knowledge base...",
              },
            ],
            details: {
              results: [],
              total: 0,
              fromCache: false,
            },
          });
          await store.ingest();
        }

        // Perform search
        const matches = await store.search(params.query, {
          limit: params.limit,
          tags: params.tags,
        });

        // Handle empty results
        if (matches.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No relevant knowledge found in the local knowledge base for "${params.query}".`,
              },
            ],
            details: {
              results: [],
              total: 0,
              fromCache: true,
            },
          };
        }

        // Format results with source citations
        const formattedResults = matches.map((m) => {
          const snippet =
            m.chunk.text.length > 200
              ? m.chunk.text.substring(0, 200) + "..."
              : m.chunk.text;

          return {
            id: m.chunk.id,
            sourcePath: m.chunk.sourcePath,
            headingText: m.chunk.headingText,
            snippet,
            relevanceScore: m.relevanceScore,
            matchReason: m.matchReason,
          };
        });

        // Build summary string with source citations
        const summary = matches
          .map((m) => {
            const sourceCitation =
              m.chunk.headingText && m.chunk.headingText !== "(root)"
                ? `${m.chunk.sourcePath} > ${m.chunk.headingText}`
                : m.chunk.sourcePath;

            return `- [${sourceCitation}] (relevance: ${m.relevanceScore}, ${m.matchReason})\n  "${formattedResults.find((r) => r.id === m.chunk.id)?.snippet}"`;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Found ${matches.length} knowledge match(es):\n\n${summary}`,
            },
          ],
          details: {
            results: formattedResults,
            total: matches.length,
            fromCache: false,
          },
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [
            {
              type: "text",
              text: `Failed to search knowledge base: ${errorMessage}. The knowledge directory may not be configured or the index may be corrupted.`,
            },
          ],
          details: {
            results: [],
            total: 0,
            fromCache: false,
          },
        };
      }
    },
  };
}
