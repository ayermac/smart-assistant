# 14-01 Summary: Stabilize Obsidian Incremental Startup Sync

## Completed

- Confirmed startup vault sync is intended to be incremental through `VectorKnowledgeStore.syncVault()`.
- Added `lastModifiedMs` as the reliable millisecond mtime column for new and migrated LanceDB knowledge tables.
- Preserved `lastModified` for compatibility and now writes seconds to avoid truncating millisecond timestamps in older Int32 schemas.
- Added mtime compatibility helpers:
  - prefer `lastModifiedMs`
  - accept short-lived Float64 `lastModified` values that already contain milliseconds
  - reject old truncated integer timestamps
  - allow a small future tolerance for stored mtimes
- Updated manifest reconstruction, `needsReindex()`, `indexFile()`, and `syncVault()` to use the compatibility helper.
- Invalidated manifest cache when deleting/reindexing source paths so same-process reads do not reuse stale source metadata.
- Added focused tests in `src/knowledge/__tests__/mtime.test.ts`.
- Updated README and README_CN with incremental startup verification guidance.

## Behavior

- Current startup sync is incremental by design.
- Existing local databases with bad legacy mtime metadata may reindex unchanged vault files once after this fix.
- After that repair run writes `lastModifiedMs`, unchanged subsequent starts should print `Vault already up to date (...)` instead of repeated `Reindexing` lines.

## Verification

- `npm run typecheck` passed.
- `npm test` passed: 6 test files, 53 tests.
- `npm run build` passed.
