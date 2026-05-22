# Phase 5: Markdown/Text RAG - Research

**Researched:** 2026-05-22
**Status:** Ready for planning

## Executive Summary

Phase 5 adds local Markdown/text knowledge ingestion and retrieval. The implementation follows established patterns from Phase 4 (memory storage) with key adaptations for document chunking and source metadata. No new external dependencies are required.

---

## 1. Technical Approach by Decision

### D-01: Markdown Heading-Based Chunking

**Implementation Strategy:**

```typescript
interface KnowledgeChunk {
  id: string;
  sourcePath: string;      // Relative path from knowledge directory
  headingLevel: number;    // 0 for plain text, 1-6 for headings
  headingText: string;     // The heading text (empty for root/plain text)
  text: string;            // The chunk content (section body)
  startLine: number;       // Line number where chunk starts
  endLine: number;         // Line number where chunk ends
  tags: string[];          // Extracted from frontmatter or inferred
  createdAt: string;
}
```

**Chunking Algorithm:**
1. Read file content
2. Detect file type by extension (`.md`, `.txt`, `.markdown`)
3. For `.txt` files: single chunk per file with `headingLevel: 0`
4. For Markdown files:
   - Parse lines, detect heading patterns (`# `, `## `, etc.)
   - Each heading starts a new chunk
   - Content before first heading becomes a chunk with empty `headingText`
   - Preserve heading hierarchy in metadata

**Edge Cases:**
- Empty files: Skip with warning log
- Files with only headings (no body): Create chunk with empty `text`
- Large sections (>2000 chars): Log warning, store as-is (no auto-split in v1)
- Malformed Markdown: Best-effort parsing, treat as plain text if unrecoverable
- Files without extensions: Skip with warning

**Code Location:** `src/knowledge/chunker.ts`

---

### D-02: JSON File Storage with Manifest

**Storage Structure:**
```
{dataDir}/knowledge/
├── manifest.json           # Index of all chunks with metadata
└── chunks/
    ├── chunk-{uuid1}.json
    ├── chunk-{uuid2}.json
    └── ...
```

**Manifest Schema:**
```typescript
interface KnowledgeManifest {
  version: 1;
  lastIndexed: string;      // ISO timestamp of last ingestion
  sourceDir: string;        // Configured knowledge source directory
  chunks: Array<{
    id: string;
    sourcePath: string;
    headingText: string;
    headingLevel: number;
    tags: string[];
    lineCount: number;      // endLine - startLine + 1
    charCount: number;      // text.length
    modifiedAt: string;     // Source file mtime at ingestion
  }>;
  sources: Array<{
    path: string;           // Relative path
    absolutePath: string;   // Full path for mtime checks
    mtime: string;          // Last modified time
    chunkCount: number;
  }>;
}
```

**Why Manifest?**
- Enables fast listing without loading all chunk files
- Supports staleness detection (compare source mtime)
- Provides statistics for debugging/logging
- Mirrors the "index" concept without full database

**Atomic Write Pattern:**
- Follow `FileMemoryStore.atomicWriteJson()` pattern
- Write to `.tmp` file, then rename
- Manifest update is atomic; individual chunks are atomic

**Code Locations:**
- `src/knowledge/types.ts` - Interfaces
- `src/knowledge/store.ts` - FileKnowledgeStore implementation

---

### D-03: Keyword Substring Matching

**Search Algorithm (consistent with memory):**
```typescript
interface SearchOptions {
  limit?: number;           // Default: 5
  tags?: string[];          // Optional tag filter
  sourcePath?: string;      // Optional source filter
}

interface KnowledgeMatch {
  chunk: KnowledgeChunk;
  relevanceScore: number;
  matchReason: string;
}
```

**Scoring Formula:**
1. **Exact substring match** in chunk text: +10 points
2. **Word overlap**: +1 point per matching word
3. **Heading match**: +5 points if query matches heading text
4. **Tag overlap**: +2 points per matching tag
5. **Source path match**: +3 points if query contains source filename

**Result Ranking:**
- Sort by `relevanceScore` descending
- Return top N (configurable via `limit`)
- Include match reason for transparency

**Empty Result Handling:**
- Return empty array (not null)
- Tool formats response: "No relevant knowledge found in the local knowledge base for [query]."
- Assistant behavior (per RAG-05): State explicitly that knowledge base did not contain answer

**Code Location:** `src/knowledge/store.ts` - `search()` method

---

### D-04: Environment Variable Configuration

**Configuration Pattern:**
```typescript
// src/config.ts additions

export const SMART_ASSISTANT_KNOWLEDGE_DIR_ENV = "SMART_ASSISTANT_KNOWLEDGE_DIR";

export function resolveKnowledgeSourceDir(env: NodeJS.ProcessEnv = process.env): string {
  // If env var is set, use it directly
  const configured = env[SMART_ASSISTANT_KNOWLEDGE_DIR_ENV]?.trim();
  if (configured) {
    return configured;
  }

  // Otherwise, default to {dataDir}/knowledge-sources
  const dataDir = resolveDataDir(env);
  return join(dataDir, "knowledge-sources");
}
```

**Directory Handling:**
- Single directory in v1 (no array of paths)
- Subdirectories scanned recursively
- Relative paths resolved from cwd
- Absolute paths used as-is
- Non-existent directory: Create on first ingestion (with warning)

**.env.example Addition:**
```bash
# Knowledge Directory (Phase 5+)
# Directory containing Markdown/text files for knowledge retrieval
# If not set, defaults to {SMART_ASSISTANT_DATA_DIR}/knowledge-sources
SMART_ASSISTANT_KNOWLEDGE_DIR=
```

---

### D-05: On-Demand Ingestion

**Ingestion Trigger Points:**
1. First `search_knowledge` call (lazy initialization)
2. Explicit reindex command (future: CLI flag or tool)

**Staleness Detection:**
```typescript
async function needsReindex(manifest: KnowledgeManifest | null): Promise<boolean> {
  if (!manifest) return true;

  for (const source of manifest.sources) {
    const stat = await statFile(source.absolutePath);
    if (!stat || stat.mtime > source.mtime) {
      return true;  // Source file changed or deleted
    }
  }

  // Check for new files not in manifest
  const currentFiles = await scanDirectory(sourceDir);
  const knownFiles = new Set(manifest.sources.map(s => s.path));
  if (currentFiles.some(f => !knownFiles.has(f))) {
    return true;
  }

  return false;
}
```

**Ingestion Flow:**
```
search_knowledge(query)
  |
  v
check manifest exists?
  | no
  v
runIngestion()
  |
  v
scan source directory
  |
  v
for each .md/.txt file:
  - parse into chunks
  - write chunk files
  - update manifest
  |
  v
search chunks with query
```

**Full Re-scan in v1:**
- Delete all existing chunks
- Rebuild manifest from scratch
- No incremental updates (deferred to v2)

**Performance Consideration:**
- Large directories (>100 files) may cause delay on first search
- Log progress during ingestion for user awareness
- Consider background ingestion flag for future

---

## 2. File Structure and Interfaces

### New Files to Create

```
src/knowledge/
  index.ts          # Public exports
  types.ts          # Interfaces (KnowledgeChunk, KnowledgeStore, etc.)
  store.ts          # FileKnowledgeStore implementation
  chunker.ts        # Markdown/text chunking logic
  ingestion.ts      # Directory scanning and ingestion orchestration

src/tools/
  knowledge.ts      # createSearchKnowledgeTool factory
```

### Interface Definitions

```typescript
// src/knowledge/types.ts

export interface KnowledgeChunk {
  id: string;
  sourcePath: string;
  headingLevel: number;
  headingText: string;
  text: string;
  startLine: number;
  endLine: number;
  tags: string[];
  createdAt: string;
}

export interface KnowledgeMatch {
  chunk: KnowledgeChunk;
  relevanceScore: number;
  matchReason: string;
}

export interface SearchOptions {
  limit?: number;
  tags?: string[];
  sourcePath?: string;
}

export interface KnowledgeManifest {
  version: 1;
  lastIndexed: string;
  sourceDir: string;
  chunks: Array<ChunkMetadata>;
  sources: Array<SourceMetadata>;
}

export interface KnowledgeStore {
  /** Ingest all files from the configured source directory. */
  ingest(): Promise<IngestResult>;

  /** Search for relevant chunks. Triggers ingestion if not indexed. */
  search(query: string, options?: SearchOptions): Promise<KnowledgeMatch[]>;

  /** Get the current manifest (null if not ingested). */
  getManifest(): Promise<KnowledgeManifest | null>;

  /** Check if reindex is needed. */
  needsReindex(): Promise<boolean>;

  /** Get a specific chunk by ID. */
  getChunk(id: string): Promise<KnowledgeChunk | null>;

  /** List all chunks (for debugging). */
  listChunks(): Promise<KnowledgeChunk[]>;
}
```

---

## 3. Tool Contract for `search_knowledge`

```typescript
// src/tools/knowledge.ts

const SearchKnowledgeParameters = Type.Object({
  query: Type.String({
    description: "Search query to find relevant knowledge",
  }),
  limit: Type.Optional(
    Type.Number({
      minimum: 1,
      maximum: 20,
      description: "Maximum results to return (default: 5)",
    })
  ),
  tags: Type.Optional(
    Type.Array(Type.String(), {
      description: "Filter by specific tags",
    })
  ),
});

interface SearchKnowledgeDetails {
  results: Array<{
    id: string;
    sourcePath: string;
    headingText: string;
    snippet: string;      // First 200 chars of chunk text
    relevanceScore: number;
    matchReason: string;
  }>;
  total: number;
  fromCache: boolean;     // Whether results came from existing index
}

export function createSearchKnowledgeTool(
  store: KnowledgeStore
): AgentTool<typeof SearchKnowledgeParameters, SearchKnowledgeDetails>
```

**Tool Behavior:**
- Triggers ingestion on first call if not indexed
- Returns formatted response with source citations
- Empty results: "No relevant knowledge found in the local knowledge base for [query]."
- Error handling: Catch ingestion errors, return explainable error

---

## 4. Integration Points

### src/config.ts
```typescript
// Add to existing exports
export const SMART_ASSISTANT_KNOWLEDGE_DIR_ENV = "SMART_ASSISTANT_KNOWLEDGE_DIR";

// Add to DATA_SUBDIRS (already has 'knowledge')
// No change needed - already defined

// New function
export function resolveKnowledgeSourceDir(env?: NodeJS.ProcessEnv): string;
```

### src/tools/registry.ts
```typescript
// Extend createAllTools signature
export function createAllTools(
  memoryStore: MemoryStore,
  knowledgeStore: KnowledgeStore  // Add parameter
): AgentTool[] {
  return [
    get_time,
    createRememberTool(memoryStore),
    createRecallMemoryTool(memoryStore),
    createSearchKnowledgeTool(knowledgeStore),  // Add tool
  ];
}
```

### src/assistant/controller.ts
```typescript
// In constructor:
const memoryStore = new FileMemoryStore();
const knowledgeStore = new FileKnowledgeStore();  // Add

this.agent = new Agent({
  initialState: {
    systemPrompt: SYSTEM_PROMPT,  // Update with knowledge rules
    tools: createAllTools(memoryStore, knowledgeStore),  // Pass both
    // ...
  },
});
```

### System Prompt Update
```typescript
const SYSTEM_PROMPT = `You are a helpful local assistant. When uncertain, ask clarifying questions. If you cannot answer confidently, say so.

You have access to a \`remember\` tool for storing long-term facts and preferences.
Only use it when the user explicitly asks you to remember something.
Do not automatically store conversation turns as memories.

You have access to a \`search_knowledge\` tool for searching local Markdown/text knowledge.
Use it when the user asks about information that might be in their notes or documents.
When knowledge is found, cite the source path in your response (e.g., "According to \`notes/typescript.md > Type Safety\`...").
If the knowledge base does not contain relevant information, state that explicitly.

Distinguish information from memory vs knowledge search when relevant.`;
```

---

## 5. Edge Cases and Error Handling

### Ingestion Errors

| Scenario | Handling |
|----------|----------|
| Source directory doesn't exist | Create with warning log |
| Source directory is empty | Log info, manifest with empty arrays |
| File read permission denied | Skip file, log warning |
| File is binary/corrupted | Skip file, log warning |
| File too large (>1MB) | Skip file, log warning with suggestion |
| Circular symlink | Detect and skip, log warning |

### Search Errors

| Scenario | Handling |
|----------|----------|
| Query is empty/whitespace | Return empty results with message |
| Manifest corrupted | Re-run ingestion automatically |
| Chunk file missing | Re-run ingestion automatically |
| No results found | Return empty array, tool formats message |

### Runtime Errors

| Scenario | Handling |
|----------|----------|
| KnowledgeStore not initialized | Throw in constructor (fail fast) |
| Ingestion in progress | Block concurrent calls, or queue |
| Disk full during write | Propagate error with clear message |

---

## 6. Dependencies

### No New External Dependencies Required

All functionality can be implemented with Node.js built-in modules:
- `node:fs/promises` - File operations
- `node:path` - Path manipulation
- `node:crypto` - UUID generation
- `node:util` - Text encoding

### Existing Dependencies Used
- `@sinclair/typebox` - Parameter schemas (already in package.json)
- `@earendil-works/pi-agent-core` - AgentTool type (already in package.json)

### Future Considerations (v2)
- `marked` or `markdown-it` - Better Markdown parsing
- `gray-matter` - Frontmatter extraction
- Vector embedding library - Semantic search

---

## 7. Testing Strategy

### Unit Tests

1. **Chunker tests** (`src/knowledge/chunker.test.ts`)
   - Heading detection and splitting
   - Plain text handling
   - Edge cases (empty, malformed, large)

2. **Store tests** (`src/knowledge/store.test.ts`)
   - Ingestion creates correct chunks
   - Search returns ranked results
   - Staleness detection
   - Empty result handling

3. **Tool tests** (`src/tools/knowledge.test.ts`)
   - Parameter validation
   - Result formatting
   - Error handling

### Integration Tests

1. End-to-end ingestion and search
2. Integration with assistant controller
3. Session persistence with knowledge context

### Test Fixtures

```
src/knowledge/test-fixtures/
  simple.md           # Basic Markdown with headings
  no-headings.md      # Markdown without headings
  plain-text.txt      # Plain text file
  empty.md            # Empty file
  large.md            # File exceeding size threshold
  nested/
    deep.md           # Nested directory test
```

---

## 8. Performance Considerations

### Ingestion Performance
- O(n) where n = number of files
- Each file parsed once
- Manifest enables fast staleness checks
- Consider progress callback for large directories

### Search Performance
- O(c) where c = number of chunks (loaded from manifest)
- In-memory search after manifest load
- No external index required for v1 scale

### Memory Usage
- Manifest loaded into memory for search
- Individual chunks loaded on-demand for result details
- Consider lazy chunk loading for large knowledge bases

---

## 9. Security Considerations

### Path Traversal Prevention
- Validate source directory is within allowed boundaries
- Reject paths containing `..` that escape source directory
- Use absolute paths for validation

### File Access
- Only read `.md`, `.txt`, `.markdown` extensions
- Skip hidden files (starting with `.`)
- Skip files without read permission

### Data Validation
- Validate chunk content is valid UTF-8
- Sanitize source paths in responses (no absolute paths exposed to model)
- Limit snippet length in responses

---

## 10. Implementation Order

Recommended implementation sequence:

1. **Types** (`src/knowledge/types.ts`)
   - Define all interfaces
   - Export from index.ts

2. **Chunker** (`src/knowledge/chunker.ts`)
   - Implement Markdown parsing
   - Implement plain text handling
   - Unit tests

3. **Store** (`src/knowledge/store.ts`)
   - Implement FileKnowledgeStore
   - Manifest management
   - Search algorithm
   - Unit tests

4. **Config** (`src/config.ts`)
   - Add knowledge directory resolution
   - Update .env.example

5. **Tool** (`src/tools/knowledge.ts`)
   - Implement createSearchKnowledgeTool
   - Unit tests

6. **Registry** (`src/tools/registry.ts`)
   - Extend createAllTools

7. **Controller** (`src/assistant/controller.ts`)
   - Initialize FileKnowledgeStore
   - Update system prompt

8. **Integration Tests**
   - End-to-end scenarios
   - Error handling

---

## Summary

Phase 5 is well-scoped and follows established patterns from Phase 4. The key technical challenges are:

1. **Markdown parsing** - Heading detection and chunking (straightforward with regex)
2. **Manifest management** - Tracking source files and staleness (pattern established)
3. **Search consistency** - Matching memory retrieval behavior (algorithm defined)
4. **Lazy ingestion** - First-call trigger (flow documented)

No external dependencies are required. The implementation can proceed in the recommended order with confidence in the established patterns.
