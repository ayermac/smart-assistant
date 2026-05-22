# Phase 4 RESEARCH: Long-term Memory

**Phase:** 4
**Created:** 2026-05-22
**Status:** Research complete

---

## Technical Approach

### 1. Memory Storage Implementation

Follow the established **FileSessionStore pattern** from Phase 3 (`src/session/store.ts`).

**Storage Location:**
- Directory: `{dataDir}/memories/` (already defined in `src/config.ts` as `DATA_SUBDIRS.memory`)
- File naming: `memory-{id}.json` where ID is a UUID

**Key Implementation Details:**

```typescript
// src/memory/types.ts
export interface MemoryEntry {
  id: string;
  text: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MemoryMatch {
  entry: MemoryEntry;
  relevanceScore: number;
  matchReason: string;
}

export interface RecallOptions {
  tags?: string[];
  limit?: number;
}

export interface MemoryStore {
  store(text: string, tags?: string[]): Promise<MemoryEntry>;
  recall(query: string, options?: RecallOptions): Promise<MemoryMatch[]>;
  get(id: string): Promise<MemoryEntry | null>;
  list(): Promise<MemoryEntry[]>;
  delete(id: string): Promise<boolean>;
}
```

**Atomic Write Pattern (from FileSessionStore):**
```typescript
private async atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  await this.ensureDir();
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  await rename(tempPath, filePath);
}
```

**ID Generation:**
- Use `crypto.randomUUID()` (Node.js built-in, no external dependency)
- Rationale: Memories may be created in quick succession, UUID avoids timestamp collisions

### 2. Memory Retrieval Algorithm

**v1 Retrieval Strategy: Keyword Substring + Tag Filtering**

```typescript
async recall(query: string, options?: RecallOptions): Promise<MemoryMatch[]> {
  const memories = await this.list();
  const limit = options?.limit ?? 5;
  const tagFilter = options?.tags;

  // Step 1: Filter by tags if provided
  let candidates = memories;
  if (tagFilter && tagFilter.length > 0) {
    candidates = memories.filter(m =>
      tagFilter.some(tag => m.tags.includes(tag))
    );
  }

  // Step 2: Score by keyword match
  const queryLower = query.toLowerCase();
  const matches: MemoryMatch[] = [];

  for (const entry of candidates) {
    const textLower = entry.text.toLowerCase();
    let score = 0;
    const reasons: string[] = [];

    // Check for substring match
    if (textLower.includes(queryLower)) {
      score += 10;
      reasons.push("text match");
    }

    // Check for word overlap
    const queryWords = queryLower.split(/\s+/);
    const textWords = textLower.split(/\s+/);
    const wordOverlap = queryWords.filter(w => textWords.includes(w)).length;
    if (wordOverlap > 0) {
      score += wordOverlap;
      reasons.push(`${wordOverlap} word(s) matched`);
    }

    // Check for tag overlap
    const tagOverlap = entry.tags.filter(t =>
      queryLower.includes(t.toLowerCase())
    ).length;
    if (tagOverlap > 0) {
      score += tagOverlap * 2;
      reasons.push("tag match");
    }

    if (score > 0) {
      matches.push({
        entry,
        relevanceScore: score,
        matchReason: reasons.join(", "),
      });
    }
  }

  // Step 3: Sort by score descending, return top N
  matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return matches.slice(0, limit);
}
```

**Performance Considerations:**
- Load all memories into memory for filtering (acceptable for v1 scale)
- Case-insensitive matching
- Consider adding a manifest/index file if memory count exceeds ~1000

### 3. Tool Implementation Pattern

Follow the **get_time tool pattern** (`src/tools/get_time.ts`).

Tools need the MemoryStore instance, so use **factory functions** rather than direct exports.

**Remember Tool:**

```typescript
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { MemoryStore } from "../memory/types.js";

const RememberParameters = Type.Object({
  text: Type.String({ description: "The fact or preference to remember" }),
  tags: Type.Optional(
    Type.Array(Type.String(), { description: "Optional tags for categorization" })
  ),
});

type RememberParams = Static<typeof RememberParameters>;

export function createRememberTool(store: MemoryStore): AgentTool<typeof RememberParameters> {
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
        details: entry,
      };
    },
  };
}
```

**Recall Memory Tool:**

```typescript
const RecallMemoryParameters = Type.Object({
  query: Type.String({ description: "Search query to find relevant memories" }),
  tags: Type.Optional(
    Type.Array(Type.String(), { description: "Filter by specific tags" })
  ),
  limit: Type.Optional(
    Type.Number({ minimum: 1, maximum: 20, default: 5 })
  ),
});

type RecallMemoryParams = Static<typeof RecallMemoryParameters>;

export function createRecallMemoryTool(store: MemoryStore): AgentTool<typeof RecallMemoryParameters> {
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
          details: { memories: [], total: 0 },
        };
      }

      const summary = matches
        .map(m => `- "${m.entry.text}" (relevance: ${m.relevanceScore}, ${m.matchReason})`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${matches.length} memory(ies):\n${summary}`,
          },
        ],
        details: {
          memories: matches,
          total: matches.length,
        },
      };
    },
  };
}
```

---

## Integration Points

### 1. MemoryStore Integration with Existing Code

**New file:** `src/memory/store.ts`

```typescript
import { readFile, writeFile, rename, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { resolveDataPaths } from "../config.js";
import type { MemoryEntry, MemoryMatch, MemoryStore, RecallOptions } from "./types.js";

export class FileMemoryStore implements MemoryStore {
  private readonly memoriesDir: string;

  constructor(memoriesDir?: string) {
    this.memoriesDir = memoriesDir ?? resolveDataPaths().memory;
  }

  // ... implementation following FileSessionStore pattern
}
```

### 2. Tool Registration Pattern

**Modify:** `src/tools/registry.ts`

Current code exports a static `ALL_TOOLS` array. Change to a factory function that accepts MemoryStore:

```typescript
import { get_time } from "./get_time.js";
import { createRememberTool, createRecallMemoryTool } from "./memory.js";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { MemoryStore } from "../memory/types.js";

export function createAllTools(memoryStore: MemoryStore): AgentTool[] {
  return [
    get_time,
    createRememberTool(memoryStore),
    createRecallMemoryTool(memoryStore),
  ];
}

// Backward-compatible static export (tools without memory)
export const ALL_TOOLS: AgentTool[] = [get_time];
```

**New file:** `src/tools/memory.ts` - exports `createRememberTool` and `createRecallMemoryTool`

### 3. AssistantController Integration

**Modify:** `src/assistant/controller.ts`

Three changes required:

**A. Import MemoryStore and tool factory:**

```typescript
import { FileMemoryStore } from "../memory/store.js";
import { createAllTools } from "../tools/registry.js";
```

**B. Create MemoryStore and use tool factory:**

```typescript
constructor(
  initialMessages: AgentMessage[],
  sessionStore: SessionStore,
  sessionId: string
) {
  // ... existing API key validation ...

  this.sessionStore = sessionStore;
  this.sessionId = sessionId;

  // Create memory store
  const memoryStore = new FileMemoryStore();

  // Initialize agent with memory-enabled tools
  this.agent = new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model: getDefaultModel(),
      thinkingLevel: "off",
      tools: createAllTools(memoryStore),
      messages: initialMessages,
    },
  });

  // ... rest of constructor stays the same ...
}
```

**C. Update System Prompt:**

```typescript
const SYSTEM_PROMPT = `You are a helpful local assistant. When uncertain, ask clarifying questions. If you cannot answer confidently, say so.

You have access to a \`remember\` tool for storing long-term facts and preferences.
Only use it when the user explicitly asks you to remember something.
Do not automatically store conversation turns as memories.

When recalling memories, cite the memory content clearly in your response.
Distinguish information from memory vs knowledge search when relevant.`;
```

---

## Implementation Notes

### Files to Create

| File | Purpose |
|------|---------|
| `src/memory/types.ts` | MemoryEntry, MemoryMatch, MemoryStore, RecallOptions interfaces |
| `src/memory/store.ts` | FileMemoryStore implementation |
| `src/memory/index.ts` | Barrel exports |
| `src/tools/memory.ts` | createRememberTool and createRecallMemoryTool factories |

### Files to Modify

| File | Changes |
|------|---------|
| `src/tools/registry.ts` | Add `createAllTools(memoryStore)` factory, keep `ALL_TOOLS` for compat |
| `src/tools/index.ts` | Export memory tool factories |
| `src/assistant/controller.ts` | Import MemoryStore, use createAllTools, update system prompt |

### Patterns to Follow

1. **FileSessionStore Pattern** (`src/session/store.ts`):
   - Atomic write with temp file + rename
   - Directory auto-creation with `recursive: true`
   - Error handling for ENOENT (file not found)
   - JSON pretty-printing for debugging

2. **Tool Implementation Pattern** (`src/tools/get_time.ts`):
   - TypeBox schema for parameters
   - Static type inference via `Static<typeof Schema>`
   - Explicit content array in response
   - Optional details object for structured data

3. **Type Exports** (`src/session/types.ts`):
   - Interface definitions separate from implementation
   - JSDoc comments for documentation
   - Clear separation of data types vs store interface

### Edge Cases and Error Handling

| Edge Case | Handling |
|-----------|----------|
| Empty memory store | `recall()` returns empty array; `recall_memory` tool returns friendly "no memories" message |
| Invalid memory ID on `get()` | Return `null` |
| Invalid memory ID on `delete()` | Return `false` |
| Corrupted memory file in `list()` | Skip with logged warning, do not crash |
| Directory permission errors | Let errors propagate; controller handles gracefully |
| Concurrent writes | Atomic write pattern prevents most corruption |
| Large memory count (>1000) | Document as known v1 limitation; manifest file optimization deferred |

### System Prompt Behavior Rules

From `04-CONTEXT.md` and agent behavior rules in `SUMMARY.md`:

```
You have access to a `remember` tool for storing long-term facts and preferences.
Only use it when the user explicitly asks you to remember something.
Do not automatically store conversation turns as memories.
When recalling memories, cite the memory content clearly in your response.
Distinguish information from memory vs knowledge search when relevant.
```

**Additional guidance embedded in system prompt:**
- When `recall_memory` returns empty, say "I don't have any memories about that"
- Never fabricate memory content
- Use `recall_memory` for user preferences or durable historical facts
- Use `remember` only for explicit long-term facts or preferences

---

## Traceability Matrix

| Requirement | Implementation | File(s) |
|-------------|----------------|---------|
| MEM-01 | Explicit `remember` tool call, system prompt constraint | `src/tools/memory.ts`, `src/assistant/controller.ts` |
| MEM-02 | MemoryEntry schema with id, text, tags, timestamps | `src/memory/types.ts`, `src/memory/store.ts` |
| MEM-03 | Keyword + tag retrieval with relevance scoring | `src/memory/store.ts`, `src/tools/memory.ts` |
| MEM-04 | System prompt instruction + tool-only trigger (no auto-storage) | `src/assistant/controller.ts` |
| MEM-05 | MemoryMatch with matchReason, distinguish in tool response format | `src/tools/memory.ts`, `src/memory/types.ts` |

---

## Dependencies

| Dependency | Usage | New? |
|------------|-------|------|
| `@earendil-works/pi-agent-core` | AgentTool type | No |
| `@sinclair/typebox` | Schema validation for tool parameters | No |
| Node.js `fs/promises` | File operations | No |
| Node.js `crypto` | `randomUUID()` for memory IDs | No |

**No new external dependencies required.**

---

## Testing Checklist

After implementation, verify:

- [ ] `remember` tool stores memory to JSON file in `{dataDir}/memories/`
- [ ] Stored file matches MemoryEntry schema (id, text, tags, createdAt, updatedAt)
- [ ] `recall_memory` returns matching memories sorted by relevance
- [ ] `recall_memory` returns empty result gracefully (no crash)
- [ ] Memory files use atomic write pattern (temp + rename)
- [ ] System prompt includes memory behavior rules
- [ ] Tools are registered via `createAllTools(memoryStore)`
- [ ] Memory store directory is created automatically on first write
- [ ] Corrupted JSON files are skipped, not crash the application
- [ ] `crypto.randomUUID()` generates unique IDs
- [ ] Tag filtering works correctly in `recall()`
- [ ] Case-insensitive keyword matching works

---

*Research completed: 2026-05-22*
*Ready for planning phase*
