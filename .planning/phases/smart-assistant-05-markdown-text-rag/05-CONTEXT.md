# Phase 5: Markdown/Text RAG - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Add local Markdown/text knowledge ingestion and retrieval with source-aware, conservative answering. Users can point the assistant at a local knowledge directory, ingest files into searchable chunks, and receive answers that cite source paths. When no relevant knowledge is found, the assistant explicitly states the gap.

**In scope:**
- Knowledge directory configuration via environment variable
- Markdown/text file discovery and ingestion
- Heading-based chunking with source metadata
- Keyword-based search with relevance scoring
- `search_knowledge` tool for retrieval
- Assistant cites source paths in responses
- Empty-result behavior: assistant states knowledge base did not contain an answer

**Out of scope:**
- PDF, docx, or web crawling
- Vector embeddings or semantic search
- Cloud knowledge sync
- Knowledge editing or deletion
- Incremental re-ingestion
- Cross-session knowledge summarization

</domain>

<decisions>
## Implementation Decisions

### Chunking Strategy
- **D-01:** Use Markdown heading-based chunking — split files at heading boundaries (#, ##, ###). Each section becomes one chunk. Preserves semantic completeness and heading hierarchy.
  - Chunk metadata includes: source file path, heading level, heading text, start/end line numbers
  - If a section exceeds a configurable threshold (e.g., 2000 chars), log a warning but do not auto-split in v1
  - Plain text files (.txt) are chunked as a single chunk per file (no heading structure)

### Index Storage
- **D-02:** Use JSON files for chunk storage, consistent with memory and session patterns.
  - Each chunk stored as `{dataDir}/knowledge/chunk-{id}.json`
  - A manifest file `{dataDir}/knowledge/manifest.json` tracks all chunks with source file, heading, and metadata for fast listing
  - Manifest enables efficient search without loading all chunk files
  - Directory structure mirrors the established `DATA_SUBDIRS` pattern from `src/config.ts`

### Search Algorithm
- **D-03:** Use keyword substring matching combined with heading/tag metadata filtering, consistent with memory retrieval (Phase 4).
  - Case-insensitive keyword matching against chunk text
  - Heading text also included in search scope
  - Relevance scoring based on: keyword match count + heading match bonus + tag overlap
  - Return top N results (configurable, default 5) with source path, snippet, and relevance score
  - No external dependencies (BM25, TF-IDF, or embedding APIs deferred to v2)

### Knowledge Directory Configuration
- **D-04:** Configure knowledge directory via environment variable `SMART_ASSISTANT_KNOWLEDGE_DIR`, consistent with existing config pattern.
  - If not set, default to `{dataDir}/knowledge-sources`
  - Supports a single directory path in v1 (no multiple directories)
  - Directory is scanned on demand when `search_knowledge` is called or when user triggers ingestion
  - Subdirectories are scanned recursively

### Ingestion Trigger
- **D-05:** Ingestion is triggered on-demand, not automatically at startup.
  - `search_knowledge` checks if the knowledge base is indexed before searching; if not, runs ingestion first
  - A `--reindex` flag or command can force re-ingestion
  - Manifest tracks source file modification timestamps to detect stale chunks
  - In v1, ingestion is a full re-scan (no incremental updates)

### Claude's Discretion
- Exact chunk JSON schema field names
- Relevance scoring formula details
- Manifest JSON schema structure
- Error message wording
- `search_knowledge` tool parameter defaults

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements
- `.planning/REQUIREMENTS.md` — RAG-01 through RAG-06
- `.planning/research/SUMMARY.md` — Agent behavior rules, tool contracts

### Prior Phase Patterns
- `.planning/phases/04-long-term-memory/04-CONTEXT.md` — Memory storage and retrieval pattern (JSON files, keyword matching, tool factories)
- `src/memory/types.ts` — MemoryStore interface pattern to follow for KnowledgeStore
- `src/memory/store.ts` — FileMemoryStore implementation pattern
- `src/tools/memory.ts` — Tool factory pattern with dependency injection
- `src/tools/registry.ts` — createAllTools factory pattern

### Configuration
- `src/config.ts` — DATA_SUBDIRS pattern, environment variable resolution
- `.env.example` — Existing environment variable documentation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/memory/types.ts` + `src/memory/store.ts`: MemoryStore interface and FileMemoryStore — follow same pattern for KnowledgeStore and FileKnowledgeStore
- `src/tools/memory.ts`: `createRememberTool()` and `createRecallMemoryTool()` factory pattern — follow for `createSearchKnowledgeTool()`
- `src/tools/registry.ts`: `createAllTools(memoryStore)` — extend to accept knowledgeStore
- `src/config.ts`: `resolveDataDir()`, `DATA_SUBDIRS`, `resolveDataPaths()` — add `knowledge` subdirectory
- `src/assistant/controller.ts`: System prompt with memory behavior rules — extend with knowledge behavior rules

### Established Patterns
- JSON file storage with atomic writes (write temp → rename)
- Tool factory with dependency injection (store passed as parameter)
- Keyword + tag matching for retrieval (consistent search behavior)
- Environment variable configuration with dotenv

### Integration Points
- `src/tools/registry.ts`: Add knowledgeStore parameter to createAllTools
- `src/assistant/controller.ts`: Create FileKnowledgeStore, pass to createAllTools, update system prompt
- `src/config.ts`: Add `knowledge` to DATA_SUBDIRS, add KNOWLEDGE_DIR env var
- `.env.example`: Add SMART_ASSISTANT_KNOWLEDGE_DIR documentation

</code_context>

<specifics>
## Specific Ideas

- Knowledge search results should clearly distinguish from memory results (MEM-05 carries forward)
- Source path citation format: "According to `notes/typescript-tips.md > Type Safety`..."
- Empty result response: "The local knowledge base did not contain information about [topic]"

</specifics>

<deferred>
## Deferred Ideas

- Vector embeddings / semantic search (v2 — RAG2-01)
- PDF/docx support (v2 — RAG2-02)
- Web ingestion / cloud sync (v2 — RAG2-03)
- Incremental re-ingestion (only scan changed files)
- Multiple knowledge directories
- Knowledge editing or deletion
- Chunk overlap for better context continuity
- Knowledge base statistics / admin commands

</deferred>

---

*Phase: 05-markdown-text-rag*
*Context gathered: 2026-05-22*
