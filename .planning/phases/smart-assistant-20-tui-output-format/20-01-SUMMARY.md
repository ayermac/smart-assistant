# 20-01 Summary: Improve TUI Output Formatting

## Completed

- Added `src/tui-format.ts` for terminal-oriented log formatting.
- Added fixed-width speaker prefixes in the Ink transcript.
- Wrapped assistant output according to the current terminal width.
- Rendered continuation rows without repeated prefixes.
- Normalized assistant Markdown display:
  - `According to \`path > heading\`:` becomes `来源：path > heading：`
  - `**bold**` markers are removed for cleaner terminal text
- Added continuation indentation for numbered and bullet lists.
- Updated README, README_CN, and CHANGELOG.

## Verification

- `npm run typecheck` passed.
- `npm test` passed: 10 files, 66 tests.
- `npm run build` passed.
- `node dist/cli.js --help` passed.
- `node dist/tui.js --help` passed.
- `git diff --check` passed.
