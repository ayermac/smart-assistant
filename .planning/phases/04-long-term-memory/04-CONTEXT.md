# Phase 4 CONTEXT: Long-term Memory

**Phase:** 4
**Created:** 2026-05-22
**Status:** Decisions locked

---

## Phase Goal

Implement explicit long-term memory write and recall while keeping it separate from session history and RAG.

## Requirements

- **MEM-01**: User can ask the assistant to remember an explicit long-term fact or preference.
- **MEM-02**: `remember` stores long-term memory locally with text, optional tags, timestamps, and an identifier.
- **MEM-03**: `recall_memory` can retrieve relevant memories for a query.
- **MEM-04**: Assistant does not store every conversation turn as long-term memory.
- **MEM-05**: Assistant distinguishes memory results from RAG knowledge in responses and internal context.

## Success Criteria

1. User can ask the assistant to remember a stable preference or fact.
2. Stored memory includes text, optional tags, timestamp, and identifier.
3. User can later ask a related question and the assistant recalls the memory.
4. Normal conversation turns are not automatically written as long-term memory.
5. Assistant can explain whether an answer came from memory or knowledge search when relevant.

---

## Locked Decisions

### 1. Storage Backend: JSON Files

**Decision:** Each memory is stored as a single JSON file in the memories directory.

**Rationale:**
- Consistent with Phase 3 session storage pattern
- No additional dependencies required
- Simple to implement and debug
- SQLite can be introduced later if query performance becomes an issue

**File location:** `{dataDir}/memories/memory-{id}.json`

**Implementation notes:**
- Use `src/config.ts` `DATA_SUBDIRS` pattern (add `memories` subdirectory)
- Ensure directory exists before writing
- Use atomic write pattern (write to temp file, then rename) to avoid corruption
- Consider a manifest/index file for faster listing if memory count grows

---

### 2. Retrieval Strategy: Keyword + Tag Matching

**Decision:** v1 uses keyword substring matching combined with tag filtering.

**Rationale:**
- Sufficient for v1 memory volume expectations
- No external dependencies (embedding APIs)
- Can be upgraded to semantic search in v2 without changing the storage format

**Matching modes:**
1. **Full-text substring match** — Query string appears in memory text
2. **Tag filter** — User can filter by specific tags
3. **Relevance scoring** — Results ranked by match count and tag overlap

**Implementation notes:**
- Load all memory files and filter in-memory (acceptable for v1 scale)
- Case-insensitive matching
- Return top N results (configurable, default 5)
- Include match reason in response metadata

---

### 3. Memory Boundary: Tool-Only Constraint

**Decision:** Memory storage is only triggered by explicit `remember` tool calls.

**Rationale:**
- MEM-04 requires no automatic storage of conversation turns
- Tool-based approach makes the action intentional and visible
- System prompt enforces the behavior rule

**Safeguards:**
- `remember` is a tool that must be explicitly invoked
- No automatic memory creation logic in the controller
- System prompt includes explicit instruction: "Only use `remember` when the user explicitly asks"
- Memory files stored in separate directory from sessions

**System prompt addition:**
```
You have access to a `remember` tool for storing long-term facts.
Only use it when the user explicitly asks you to remember something.
Do not automatically store conversation turns as memories.
```

---

### 4. Memory Schema: Minimal Fields

**Decision:** Store only the fields required by MEM-02.

**Schema:**

```typescript
interface MemoryEntry {
  id: string;           // UUID or timestamp-based ID
  text: string;         // Memory content
  tags: string[];       // Optional tags (default: empty array)
  createdAt: string;    // ISO timestamp
  updatedAt: string;    // Last update timestamp
}
```

**Rationale:**
- Satisfies MEM-02 requirements exactly
- No over-engineering for v1
- Tags provide enough flexibility for categorization

**Implementation notes:**
- Use UUID for ID generation (or timestamp pattern from Phase 3)
- `tags` defaults to empty array if not provided
- `updatedAt` equals `createdAt` on initial creation
- Store as JSON with pretty-printing for debugging

---

## Tool Contracts

### `remember(text, tags?)`

Stores a long-term memory and returns the stored item ID.

```typescript
const RememberParameters = Type.Object({
  text: Type.String({ description: "The fact or preference to remember" }),
  tags: Type.Optional(
    Type.Array(Type.String(), { description: "Optional tags for categorization" })
  ),
});

// Returns: { id: string, text: string, tags: string[], createdAt: string }
```

### `recall_memory(query, tags?, limit?)`

Retrieves relevant memories for a query.

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

// Returns: { memories: MemoryMatch[], total: number }
// MemoryMatch: { id, text, tags, createdAt, relevanceScore, matchReason }
```

---

## Implementation Contracts

### MemoryStore Interface

```typescript
interface MemoryStore {
  // Store a new memory
  store(text: string, tags?: string[]): Promise<MemoryEntry>;

  // Retrieve memories matching query
  recall(query: string, options?: RecallOptions): Promise<MemoryMatch[]>;

  // Get a specific memory by ID
  get(id: string): Promise<MemoryEntry | null>;

  // List all memories (for debugging/admin)
  list(): Promise<MemoryEntry[]>;

  // Delete a memory by ID
  delete(id: string): Promise<boolean>;
}

interface RecallOptions {
  tags?: string[];
  limit?: number;
}

interface MemoryMatch {
  entry: MemoryEntry;
  relevanceScore: number;
  matchReason: string; // e.g., "text match", "tag match"
}
```

### Agent Integration

- `remember` and `recall_memory` tools registered in `src/tools/`
- Tools use shared `MemoryStore` instance
- Controller passes memory store to tools (dependency injection)
- System prompt updated to include memory behavior rules

---

## Context Assembly for Responses

When memories are retrieved, the assistant should:

1. **Distinguish source** — Indicate when information came from memory vs knowledge base
2. **Cite memories** — Reference the memory content clearly in responses
3. **Handle empty results** — Say "I don't have any memories about that" when recall returns empty

**Example response pattern:**
```
User: What's my favorite programming language?

Assistant: Based on what you've told me to remember, your favorite programming language is TypeScript.

[Internal: recall_memory returned memory id "abc123" with text "My favorite programming language is TypeScript"]
```

---

## Out of Scope for Phase 4

- Semantic search with embeddings
- Memory editing (update text/tags after creation)
- Memory expiration or TTL
- Memory importance scoring
- Memory deduplication
- Cross-session memory summarization
- Memory export/import

---

## Dependencies

- `@earendil-works/pi-agent-core` (AgentTool type)
- `@sinclair/typebox` (schema validation)
- Node.js `fs` module for file operations
- `uuid` package or timestamp-based ID generation

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/memory/types.ts` | Create | MemoryEntry, MemoryStore interfaces |
| `src/memory/store.ts` | Create | FileMemoryStore implementation |
| `src/memory/index.ts` | Create | Barrel exports |
| `src/tools/memory.ts` | Create | `remember` and `recall_memory` tool factories |
| `src/tools/registry.ts` | Modify | Register new tools via createAllTools factory |
| `src/tools/index.ts` | Modify | Export memory tool factories |
| `src/assistant/controller.ts` | Modify | Inject MemoryStore, update system prompt |

---

## Traceability

| Requirement | Decision | Implementation |
|-------------|----------|----------------|
| MEM-01 | Tool-only constraint, explicit `remember` call | `remember.ts` tool |
| MEM-02 | Minimal schema with id, text, tags, timestamps | `memory/types.ts` |
| MEM-03 | Keyword + tag matching retrieval | `recall_memory.ts`, `store.ts` |
| MEM-04 | System prompt + no auto-storage logic | `controller.ts` system prompt |
| MEM-05 | Distinguish memory vs RAG in context assembly | Tool response format |

---

## Canonical References

- `.planning/REQUIREMENTS.md` — MEM-01 through MEM-05
- `.planning/research/SUMMARY.md` — Tool contracts, agent behavior rules
- `.planning/phases/03-local-session-persistence/03-CONTEXT.md` — Session storage pattern reference

---

*CONTEXT created: 2026-05-22*
*Ready for research and planning*
