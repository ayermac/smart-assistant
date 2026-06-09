# 12-01 Summary: Project Consistency Repair

## Completed

- Centralized default provider/model constants and aligned runtime defaults with README/.env examples.
- Threaded resolved data paths from CLI into session, memory vector, knowledge vector, and planning stores.
- Updated direct vector store defaults to respect `SMART_ASSISTANT_DATA_DIR`.
- Made vector knowledge full ingestion idempotent by clearing existing chunks and reusing `indexFile()`.
- Fixed PDF/DOCX indexing to load binary files by absolute path while storing relative source metadata.
- Preserved `lastModified` metadata in manifest reconstruction and fixed Obsidian sync handling for `0` mtimes.
- Removed default exposure of the `mock_failure` test tool and added an explicit test-tool option.
- Added `vitest.config.ts` so tests exclude compiled `dist` artifacts.
- Added source tests for tool registry test-tool gating.

## Review Notes

- Planning records for this repair stay under `.planning`; no standalone `docs/` files are used.
- In vault mode, the knowledge store source base is set to the vault path so vault sync and automatic reindex checks share one source boundary.
- The remaining `scripts/eval.ts` direct `mock_failure` import is intentional; the test tool remains importable for evaluation but is no longer registered in normal assistant runtime.

## Verification

- `npm run typecheck` passed.
- `npm test` passed: 4 test files, 44 tests.
- `npm run build` passed.
- `git diff --check` passed.

