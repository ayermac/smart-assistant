# Phase 8: Knowledge RAG Vector Search - Context

**Gathered:** 2026-05-23
**Status:** Ready for planning
**Source:** Analysis of current implementation

<domain>
## Phase Boundary

Add vector-based semantic search to Knowledge RAG, reusing existing LanceDB + Doubao embedding infrastructure from Memory module.

Current state:
- Memory: ✅ Uses LanceDB + Doubao embedding (2048-dim vectors)
- Knowledge: ❌ Uses keyword matching (`calculateRelevanceScore`)

This phase upgrades Knowledge RAG to use the same semantic search approach as Memory.

</domain>

<decisions>
## Implementation Decisions

### Reuse Existing Infrastructure
- **Embedding:** Reuse `src/memory/embedding.ts` (`getEmbedding`, `createDefaultEmbeddingConfig`)
- **Vector DB:** Add new LanceDB table `knowledge` in same database
- **Dimensions:** 2048 (same as Memory, using Doubao embedding)
- **Reasoning:** Consistent architecture, reduced complexity, proven working code

### Knowledge Vector Store Design
- **Table Name:** `knowledge` (separate from `memories` table)
- **Schema:** id, vector, text, sourcePath, headingText, headingLevel, tags, createdAt
- **Storage Path:** `.smart-assistant/vectors/` (shared with Memory)
- **Reasoning:** Same database, separate tables for clear separation

### Search Flow
- **Ingest:** File → Chunks → Embeddings → LanceDB `knowledge` table
- **Search:** Query → Embedding → Vector Search → Results with metadata
- **Fallback:** If vector search fails, fall back to keyword matching
- **Reasoning:** Graceful degradation, maintains reliability

### Hybrid Scoring (Optional Enhancement)
- Combine vector similarity score with keyword match score
- Weight: 0.7 vector + 0.3 keyword (tunable)
- **Reasoning:** Best of both worlds - semantic understanding + exact matches

### Claude's Discretion
- Exact hybrid scoring formula
- Chunk re-embedding strategy (when to update)
- Error handling details

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Vector Infrastructure
- `src/memory/vector-store.ts` — LanceDB integration to reference
- `src/memory/embedding.ts` — Doubao embedding client to reuse
- `src/memory/types.ts` — MemoryStore interface pattern

### Knowledge Module to Modify
- `src/knowledge/store.ts` — Current FileKnowledgeStore to extend
- `src/knowledge/types.ts` — Types to extend with vector fields
- `src/knowledge/index.ts` — Module exports

### Configuration
- `src/config.ts` — Data paths and environment config

</canonical_refs>

<specifics>
## Specific Ideas

### New VectorKnowledgeStore Class
```typescript
export class VectorKnowledgeStore implements KnowledgeStore {
  private readonly embeddingConfig: EmbeddingConfig;
  private readonly dbPath: string;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;

  // Implements same interface as FileKnowledgeStore
  // but uses vector search instead of keyword matching
}
```

### LanceDB Schema for Knowledge
```typescript
const schema = new Schema([
  new Field("id", new Utf8(), false),
  new Field("vector", new FixedSizeList(2048, new Field("item", new Float32()))),
  new Field("text", new Utf8(), false),
  new Field("sourcePath", new Utf8(), false),
  new Field("headingText", new Utf8(), false),
  new Field("headingLevel", new Int32(), false),
  new Field("tags", new List(new Field("item", new Utf8()))),
  new Field("createdAt", new Utf8(), false),
]);
```

### Search Implementation
```typescript
async search(query: string, options?: SearchOptions): Promise<KnowledgeMatch[]> {
  // 1. Generate query embedding
  const queryVector = await getEmbedding(query, this.embeddingConfig);

  // 2. Vector search
  let searchQuery = this.table
    .vectorSearch(queryVector)
    .limit(options?.limit ?? 5);

  // 3. Add filters
  if (options?.sourcePath) {
    searchQuery = searchQuery.where(`sourcePath LIKE '%${options.sourcePath}%'`);
  }

  // 4. Execute and return results
  const results = await searchQuery.toArray();
  return this.toKnowledgeMatches(results);
}
```

</specifics>

<deferred>
## Deferred Ideas

- **Hybrid scoring:** Combine vector + keyword scores (v3)
- **Embedding cache:** Avoid re-embedding identical chunks (v3)
- **Incremental reindex:** Only embed changed chunks (v3)
- **Multi-language:** Auto-select embedding model by content (v3)

</deferred>

---

*Phase: 08-knowledge-rag-vector-search*
*Context gathered: 2026-05-23*
