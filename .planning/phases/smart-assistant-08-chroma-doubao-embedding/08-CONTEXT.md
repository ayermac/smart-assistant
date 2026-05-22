# Phase 8: Chroma + Doubao Embedding - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning
**Source:** PRD Express Path (.planning/research/v2-chroma-embeddings.md)

<domain>
## Phase Boundary

Replace v1's hardcoded synonym-based memory matching with vector-based semantic search using:
- **ChromaDB** as vector database
- **Doubao Embedding API** for generating embeddings

This enables true semantic retrieval without manual synonym maintenance.

</domain>

<decisions>
## Implementation Decisions

### Embedding Provider Configuration
- **Base URL:** `https://ark.cn-beijing.volces.com/api/coding/v3`
- **Model:** `doubao-embedding-vision`
- **API Key:** Uses existing `ANTHROPIC_API_KEY` environment variable (shared with assistant)
- **Reasoning:** User-specified provider, API key sharing reduces configuration complexity

### Vector Database Configuration
- **Database:** ChromaDB (npm package `chromadb`)
- **Storage Path:** `.smart-assistant/chroma/`
- **Collection Name:** `memories`
- **Reasoning:** Local-first, no external DB dependency

### Embedding Flow
- **Store:** Text → Doubao API → Embedding → ChromaDB
- **Recall:** Query → Doubao API → Query Embedding → Vector Search → Results
- **Reasoning:** Standard embedding workflow, no caching in v2

### API Integration
- **Endpoint:** `${baseUrl}/embeddings` (POST)
- **Request Body:** `{ model, input }`
- **Response:** `{ data: [{ embedding: number[] }] }`
- **Reasoning:** OpenAI-compatible API format

### Fallback Strategy
- If embedding API fails: log error, return empty results (graceful degradation)
- If ChromaDB fails: log error, could fallback to FileMemoryStore (v2 stretch goal)
- **Reasoning:** Fail gracefully, don't crash the assistant

### Claude's Discretion
- Exact error handling strategy
- Retry logic for API failures
- Embedding dimension validation approach
- ChromaDB client initialization details

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### PRD / Requirements
- `.planning/research/v2-chroma-embeddings.md` — Full PRD with requirements and architecture
- `.planning/REQUIREMENTS.md` — v2 requirements (RAG2-01 to RAG2-06)

### Existing Implementation
- `src/memory/store.ts` — Current FileMemoryStore implementation to replace
- `src/memory/types.ts` — MemoryStore interface to implement
- `src/assistant/controller.ts` — Where memory store is initialized

### External Documentation
- ChromaDB docs: https://cookbook.chromadb.dev/
- Doubao API docs: (user-provided endpoint)

</canonical_refs>

<specifics>
## Specific Ideas

### Environment Variables
```env
# Existing (shared)
ANTHROPIC_API_KEY=...

# New (optional, defaults provided)
EMBEDDING_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3
EMBEDDING_MODEL=doubao-embedding-vision
```

### API Request Format
```typescript
// POST ${baseUrl}/embeddings
{
  "model": "doubao-embedding-vision",
  "input": "text to embed"
}

// Response
{
  "data": [
    { "embedding": [0.1, 0.2, ...] }  // number[]
  ]
}
```

### ChromaDB Usage
```typescript
import { ChromaClient } from 'chromadb';

const client = new ChromaClient();
const collection = await client.createCollection({ name: 'memories' });

// Add with embedding
await collection.add({
  ids: ['id'],
  embeddings: [[0.1, 0.2, ...]],
  documents: ['text'],
  metadatas: [{ tags: [] }]
});

// Query
const results = await collection.query({
  queryEmbeddings: [[0.1, 0.2, ...]],
  nResults: 5
});
```

</specifics>

<deferred>
## Deferred Ideas

- **Batch embedding:** Reduce API calls by batching multiple texts (v3)
- **Embedding cache:** Avoid re-embedding identical texts (v3)
- **Fallback to FileMemoryStore:** If ChromaDB unavailable (v2 stretch)
- **Multi-language model selection:** Auto-select based on content (v3)

</deferred>

---

*Phase: 08-chroma-doubao-embedding*
*Context gathered: 2026-05-22 via PRD Express Path*