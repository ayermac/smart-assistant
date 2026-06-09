/**
 * Knowledge tools - search_knowledge.
 *
 * Factory function that creates tool with injected KnowledgeStore.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { KnowledgeStore } from "../knowledge/types.js";
import { createLogger } from "../logger.js";

export const DEFAULT_KNOWLEDGE_TOOL_TIMEOUT_MS = 45_000;

export interface CreateSearchKnowledgeToolOptions {
  timeoutMs?: number;
}

export function resolveKnowledgeToolTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const rawValue = env.SMART_ASSISTANT_KNOWLEDGE_TIMEOUT_MS ?? env.SMART_ASSISTANT_TOOL_TIMEOUT_MS;
  const parsed = rawValue ? Number(rawValue) : DEFAULT_KNOWLEDGE_TOOL_TIMEOUT_MS;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_KNOWLEDGE_TOOL_TIMEOUT_MS;
}

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

function createCombinedSignal(parentSignal: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  clear: () => void;
  isTimedOut: () => boolean;
} {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timeoutController.abort(new Error(`search_knowledge timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  const signal = parentSignal
    ? AbortSignal.any([parentSignal, timeoutController.signal])
    : timeoutController.signal;

  return {
    signal,
    clear: () => clearTimeout(timeoutId),
    isTimedOut: () => timeoutController.signal.aborted,
  };
}

function throwIfAborted(signal: AbortSignal | undefined, message = "search_knowledge was aborted"): void {
  if (!signal?.aborted) {
    return;
  }

  if (signal.reason instanceof Error) {
    throw signal.reason;
  }

  throw new Error(message);
}

async function runSearchStep<T>(
  label: string,
  timeoutMs: number,
  parentSignal: AbortSignal | undefined,
  task: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const combined = createCombinedSignal(parentSignal, timeoutMs);
  let cleanupAbortListener = () => {};

  try {
    throwIfAborted(combined.signal);
    const abortPromise = new Promise<never>((_, reject) => {
      const onAbort = () => {
        reject(new Error(`${label} aborted`));
      };

      combined.signal.addEventListener("abort", onAbort, { once: true });
      cleanupAbortListener = () => combined.signal.removeEventListener("abort", onAbort);
    });

    return await Promise.race([task(combined.signal), abortPromise]);
  } catch (error) {
    if (parentSignal?.aborted) {
      throw new Error(`${label} aborted`);
    }

    if (combined.isTimedOut()) {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    cleanupAbortListener();
    combined.clear();
  }
}

/**
 * Create the search_knowledge tool with injected KnowledgeStore.
 */
export function createSearchKnowledgeTool(
  store: KnowledgeStore,
  options?: CreateSearchKnowledgeToolOptions
): AgentTool<typeof SearchKnowledgeParameters, SearchKnowledgeDetails> {
  const timeoutMs = options?.timeoutMs ?? resolveKnowledgeToolTimeoutMs();
  const logger = createLogger("tool.search_knowledge");

  return {
    name: "search_knowledge",
    description:
      "Search local Markdown/text knowledge base for relevant information. Returns results with source citations.",
    label: "Search Knowledge",
    parameters: SearchKnowledgeParameters,

    async execute(toolCallId, params, signal, onUpdate) {
      try {
        // Check if ingestion is needed and trigger it
        onUpdate?.({
          content: [
            {
              type: "text",
              text: "Checking knowledge index...",
            },
          ],
          details: {
            results: [],
            total: 0,
            fromCache: false,
          },
        });

        const needsReindex = await runSearchStep(
          "Checking knowledge index",
          timeoutMs,
          signal,
          () => store.needsReindex()
        );

        if (needsReindex) {
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
          await runSearchStep(
            "Indexing knowledge base",
            timeoutMs,
            signal,
            (stepSignal) => store.ingest({ signal: stepSignal })
          );
        }

        // Perform search
        onUpdate?.({
          content: [
            {
              type: "text",
              text: "Searching knowledge base...",
            },
          ],
          details: {
            results: [],
            total: 0,
            fromCache: false,
          },
        });

        const matches = await runSearchStep(
          "Searching knowledge base",
          timeoutMs,
          signal,
          (stepSignal) =>
            store.search(params.query, {
              limit: params.limit,
              tags: params.tags,
              signal: stepSignal,
            })
        );

        logger.debug("search_knowledge completed", {
          queryLength: params.query.length,
          matches: matches.length,
          timeoutMs,
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
        logger.warn("search_knowledge failed", {
          queryLength: params.query.length,
          error: errorMessage,
        });

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
