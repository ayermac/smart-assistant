---
plan: 09-02
phase: 9
wave: 2
status: complete
completed_at: 2026-05-23T20:25:00.000Z
---

# 09-02 SUMMARY: Wire Hybrid Search into VectorKnowledgeStore

## Objective

Integrate BM25, RRF fusion, and text cleaning into the VectorKnowledgeStore.search() pipeline without changing the public interface.

## Completed Tasks

### Task 1: Add BM25 Integration ✅

Added to `VectorKnowledgeStore`:
- Private properties: `bm25: BM25Retriever | null`, `bm25NeedsRebuild: boolean`
- `ensureBM25Index()` method: lazily builds BM25 index from LanceDB chunks when needed
- Ingestion marks `bm25NeedsRebuild = true` after adding new chunks

### Task 2: Update search() for Hybrid Retrieval ✅

Refactored `search()` method:
- Vector search: top 20 results from LanceDB
- BM25 search: top 20 results from in-memory index
- RRF fusion: combines both result lists with k=60, returns top N
- Match reason updated to "hybrid (vector + BM25)"
- Public `KnowledgeStore.search()` signature unchanged

### Task 3: Update Ingestion to Use Cleaner ✅

Updated `ingest()` method:
- Applies `cleanText()` before chunking to remove HTML tags
- Extracts frontmatter with `extractFrontmatter()`
- Uses three-layer chunking with `maxChunkSize: 800, overlap: 80`

## Files Modified

- `src/knowledge/vector-store.ts` (modified)

## Verification

- [x] All modules compile without errors
- [x] `npm run typecheck` passes
- [x] Hybrid search pipeline integrated
- [x] KnowledgeStore interface unchanged

## Key Changes

1. **Search Flow (Before)**:
   ```
   query → getEmbedding → vectorSearch → return results
   ```

2. **Search Flow (After)**:
   ```
   query → getEmbedding → vectorSearch (top 20)
                        → ensureBM25Index() → BM25.search (top 20)
                        → rrfFusion() → return fused results
   ```

3. **Ingestion Flow (Before)**:
   ```
   readFile → chunkFile → embed → store in LanceDB
   ```

4. **Ingestion Flow (After)**:
   ```
   readFile → cleanText → extractFrontmatter → chunkFile(options)
           → embed → store in LanceDB → mark bm25NeedsRebuild
   ```

## Impact

- Semantic queries (e.g., "身份认证") now match chunks containing related keywords
- Keyword queries (e.g., "LLMRouter") get better recall through BM25
- Chunks appearing in both vector and BM25 results rank higher due to RRF fusion
