# Summary: Integrate LangChain Rerank (11-03)

## Goal

Add a reranking step after RRF fusion to improve retrieval relevance, especially for multi-document queries where initial ranking may not reflect true relevance.

## Implementation

### 1. Reranker Module Created (`src/knowledge/rerank/`)

**types.ts** - Core interfaces:
- `RerankResult` - Reranked result with normalized relevance score (0-1)
- `RerankOptions` - Options for reranking (topN, minScore)
- `Reranker` - Interface for reranking implementations
- `CohereRerankerConfig` - Configuration for Cohere reranker

**noop.ts** - Passthrough reranker:
- `NoopReranker` class that returns results unchanged
- Normalizes RRF scores to 0-1 range
- Used when reranking is disabled
- Default reranker for backward compatibility

**cohere.ts** - Cohere reranker:
- `CohereReranker` class using Cohere's rerank API
- Uses cross-encoder model for semantic relevance scoring
- Graceful fallback to original order on API errors
- Configurable model and base URL

**index.ts** - Reranker registry:
- Re-exports all types and implementations
- `createReranker(provider)` - Factory function
- `createRerankerFromEnv()` - Create from environment variables

### 2. VectorKnowledgeStore Integration

Updated `src/knowledge/vector-store.ts`:
- Added `reranker` and `enableRerank` config options
- Initialize reranker from config or environment in constructor
- Apply reranking after RRF fusion in `search()` method
- Get top 20 candidates from RRF, rerank to final limit
- Update `matchReason` to indicate reranking when enabled

### 3. Configuration Options

Environment variables in `.env.example`:
- `RERANK_ENABLED` - Enable/disable reranking (default: false)
- `RERANK_PROVIDER` - Choose reranker: "noop" or "cohere"
- `COHERE_API_KEY` - API key for Cohere reranker
- `COHERE_RERANK_MODEL` - Optional model selection
- `COHERE_RERANK_BASE_URL` - Optional API base URL override

### 4. Tests Added

`src/knowledge/__tests__/rerank.test.ts`:
- NoopReranker: score normalization, topN, minScore filter
- CohereReranker: API calls, error fallback, custom config
- Factory functions: createReranker, createRerankerFromEnv
- Environment variable configuration scenarios
- **20 tests total, all passing**

## Commits

1. `139c468` - feat: add reranker module with noop and cohere implementations
2. `fb51186` - feat: integrate reranking in VectorKnowledgeStore search
3. `be1e802` - docs: add reranking configuration options to .env.example
4. `949f2d4` - test: add comprehensive tests for reranker module

## Files Modified

- `src/knowledge/rerank/types.ts` - New file
- `src/knowledge/rerank/noop.ts` - New file
- `src/knowledge/rerank/cohere.ts` - New file
- `src/knowledge/rerank/index.ts` - New file
- `src/knowledge/vector-store.ts` - Integrated reranking
- `.env.example` - Added configuration options
- `src/knowledge/__tests__/rerank.test.ts` - New test file

## Verification

- [x] TypeScript compiles without errors
- [x] All 20 tests pass
- [x] Reranking can be enabled/disabled via config
- [x] No-op reranker returns unchanged results
- [x] Cohere reranker returns reordered results (tested with mock)
- [x] Backward compatible (disabled by default)

## Usage

### Enable Reranking with Cohere

```bash
# .env
RERANK_ENABLED=true
RERANK_PROVIDER=cohere
COHERE_API_KEY=your-api-key
```

### Programmatic Usage

```typescript
import { VectorKnowledgeStore } from "./knowledge/vector-store.js";
import { CohereReranker } from "./knowledge/rerank/index.js";

const store = new VectorKnowledgeStore({
  reranker: new CohereReranker({ apiKey: "your-api-key" }),
});
```

## Architecture

```
User Query
    ↓
VectorKnowledgeStore.search()
    ├── Vector Search (LanceDB) → top 20
    ├── BM25 Search (lexical) → top 20
    └── RRF Fusion → top 20 candidates
    ↓
Reranker.rerank() → top N final results
    ├── NoopReranker: normalize RRF scores
    └── CohereReranker: cross-encoder relevance
```

## Performance Considerations

- Reranking only processes top 20 candidates to minimize API costs
- Cohere API adds ~100-300ms latency
- NoopReranker has negligible overhead
- Graceful fallback on API errors ensures reliability

## Next Steps

Phase 11 is complete. All three plans have been executed:
- 11-01: Fixed ImageVector storage bug
- 11-02: Added PDF/DOCX document loaders
- 11-03: Integrated LangChain Rerank
