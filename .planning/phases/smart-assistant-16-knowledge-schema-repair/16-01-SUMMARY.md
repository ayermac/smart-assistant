# 16-01 Summary: Repair Corrupted Knowledge Mtime Schema

## Completed

- Reproduced the startup failure outside TUI and confirmed it came from LanceDB selecting a bad `lastModifiedMs` column.
- Added canonical knowledge table schema construction.
- Added schema compatibility detection for mtime columns.
- Changed migration behavior to recreate `knowledge` when mtime columns are missing, non-Float64, or non-nullable.
- Preserved `memories` and other tables; only the rebuildable `knowledge` index is recreated.
- Added tests in `src/knowledge/__tests__/schema.test.ts`.

## Behavior

- Existing bad local knowledge tables are repaired during `VectorKnowledgeStore.init()`.
- The next Obsidian sync will rebuild the knowledge index from vault/source files.
- After the rebuild writes correct nullable Float64 mtimes, later unchanged startups should be incremental.

## Verification

- Temporary LanceDB table with `lastModified Int32` and non-nullable `lastModifiedMs` was repaired to compatible nullable Float64 mtime fields.
- `npm run typecheck` passed.
- `npm test` passed: 7 test files, 57 tests.
- `npm run build` passed.
- `node dist/tui.js --help` passed.
- `git diff --check` passed.
