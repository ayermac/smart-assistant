# 17-01 Summary: Fix TUI Input and Exit During Initialization

## Completed

- Removed the initialization-state input block that made the visible prompt feel frozen.
- Added a shared interrupt handler for Ink Ctrl+C and process SIGINT.
- Added guarded exit state to avoid duplicate exit handling.
- Made explicit TUI exit call `process.exit(0)` after Ink cleanup.
- Added raw newline/carriage-return submit handling for terminals where Enter is not reported as `key.return`.
- Verified `/exit\n` exits a temporary TUI session.
- Updated README and README_CN with TUI initialization input and exit behavior.

## Behavior

- During initialization, users can type into the prompt.
- `/exit` and Ctrl+C can leave the TUI even while vault sync or runtime setup is still in progress.
- Non-command prompts submitted before runtime readiness show `Assistant is still initializing.`

## Verification

- `npm run typecheck` passed.
- `npm test` passed: 7 test files, 57 tests.
- `npm run build` passed.
- Temporary TUI session with isolated data/vault paths accepted `/exit\n` and exited with code 0.
- `git diff --check` passed after documentation updates.
