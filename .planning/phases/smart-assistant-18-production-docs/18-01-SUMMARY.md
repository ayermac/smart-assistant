# 18-01 Summary: Document Changelog and Production Usage

## Completed

- Added README Production Usage instructions.
- Added README_CN 生产环境使用 instructions.
- Documented compiled entry points:
  - `node dist/cli.js`
  - `node dist/tui.js`
- Documented installed binary commands:
  - `smart-assistant`
  - `smart-assistant-tui`
- Added recommended production environment variables:
  - `SMART_ASSISTANT_DATA_DIR`
  - `OBSIDIAN_VAULT_PATH`
- Clarified that npm is only needed for one-time setup/build; daily use should run `smart-assistant` or `smart-assistant-tui`.
- Added Unreleased changelog entries for the current branch.
- Updated standalone CHANGELOG.md with the current Unreleased changes.
- Fixed installed npm binary execution through package-manager symlinks after production verification exposed silent exits.

## Verification

- `npm run typecheck` passed.
- `npm test` passed: 7 files, 59 tests.
- `npm run build` passed.
- `node dist/cli.js --help` passed.
- `node dist/tui.js --help` passed.
- `npm_config_prefix=/private/tmp/smart-assistant-prefix npm install -g .` passed.
- `/private/tmp/smart-assistant-prefix/bin/smart-assistant --help` passed.
- `/private/tmp/smart-assistant-prefix/bin/smart-assistant-tui --help` passed.
- `git diff --check` passed.
