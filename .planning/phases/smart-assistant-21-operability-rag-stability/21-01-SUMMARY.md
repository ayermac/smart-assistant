# 21-01 Summary: Operability and RAG Stability Hardening

## Completed

- Added `src/logger.ts` with structured local logging, log-level filtering, metadata formatting, and `timeAsync`.
- Added `SMART_ASSISTANT_LOG_LEVEL` diagnostics for knowledge and tool paths.
- Added timing around key RAG stages:
  - index freshness check
  - query embedding
  - LanceDB vector search
  - BM25 index rebuild and search
  - RRF fusion
  - rerank
  - write queue waits
- Added `AsyncOperationQueue` and routed knowledge writes through it:
  - `ingest`
  - `indexFile`
  - `reindexFile`
  - `removeFile`
  - `syncVault`
- Kept nested write operations unlocked internally to avoid reentrant queue deadlocks.
- Reduced high-volume vault indexing messages to debug-level logs.
- Added script typechecking with `tsconfig.scripts.json` and `npm run typecheck:scripts`.
- Added `npm run verify` for source typecheck, script typecheck, tests, and build.
- Fixed `scripts/eval.ts` to use the current knowledge-store search API.
- Added offline RAG integration coverage for index + search + source metadata.
- Updated `README.md`, `README_CN.md`, and `CHANGELOG.md`.

## Verification

Passed on 2026-06-09:

```bash
npm run verify
```

Result:

- `npm run typecheck`: passed
- `npm run typecheck:scripts`: passed
- `npm test`: passed, 13 test files / 74 tests
- `npm run build`: passed

Additional checks:

```bash
node dist/cli.js --help
node dist/tui.js --help
git diff --check
```

Result:

- CLI help printed successfully.
- TUI help printed successfully.
- No whitespace errors.

## Notes

- Search still performs normal retrieval semantics; this phase focused on observability and execution stability.
- Searches wait for active queued writes before reading the knowledge table.
- Startup vault sync remains incremental after legacy mtime metadata repair.
- Debug logging writes to stderr so normal CLI/TUI output stays focused.
