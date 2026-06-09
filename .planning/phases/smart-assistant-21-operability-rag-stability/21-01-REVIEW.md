# 21-01 Review: Operability and RAG Stability Hardening

## Resolved Findings

### Fixed Warning: Search could overlap with watcher writes after the initial wait

- File: `src/knowledge/vector-store.ts`
- Lines reviewed: `520-641`, `867-1117`
- Severity: Warning
- Status: Fixed

`search()` waits for writes only once at the beginning via `waitForWrites("search")`. If no write is active at that instant, a watcher-triggered `indexFile`, `reindexFile`, `removeFile`, or `syncVault` can still enqueue and start while the search is between embedding, vector search, BM25 rebuild/search, fusion, or rerank.

That means the phase now serializes write/write operations, but it does not provide read/write exclusion. A search can observe the table while a file is being deleted and re-added, and BM25 can be rebuilt from a table state that changes before final result mapping. This weakens the stated stability goal of avoiding unstable knowledge-table state around searches.

Applied fix:

- Extended `AsyncOperationQueue` with `runRead()` and `runWrite()`.
- Ran the full `search()` body under the read gate.
- Kept search-triggered `ingest()` outside the read lock so reindexing can acquire the write gate without deadlock.
- Queued writes behind active reads and queued reads behind active/pending writes.
- Added a store-level regression test that starts a search, attempts `indexFile()` mid-search, and asserts the write does not enter embedding until search finishes.

## No Findings

- Logger level parsing, metadata formatting, and `timeAsync` behavior are covered by focused tests.
- `AsyncOperationQueue` now covers sequential writes, concurrent reads, read/write exclusion, writer priority, listener cleanup, and abort rejection.
- Script typechecking catches the `scripts/eval.ts` API drift fixed in this phase.
- Offline RAG integration test covers local indexing, search, and source metadata without network access.
- README, README_CN, CHANGELOG, and phase summary are consistent with the implemented diagnostics and verification flow.

## Verification Reviewed

Passed before applying the fix:

```bash
npm run verify
node dist/cli.js --help
node dist/tui.js --help
git diff --check
```

Passed while fixing this finding:

```bash
npm run typecheck
npm test -- src/knowledge/__tests__/write-queue.test.ts src/knowledge/__tests__/rag-e2e.test.ts
```

Final verification after the fix:

```bash
npm run verify
node dist/cli.js --help
node dist/tui.js --help
git diff --check
```

Result:

- `npm run verify`: passed, 13 test files / 78 tests
- CLI help printed successfully.
- TUI help printed successfully.
- No whitespace errors.
