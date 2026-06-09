# 15-01 Summary: Fix npm Install Dependency Resolution

## Completed

- Fixed the `npm install` ERESOLVE caused by `apache-arrow@21.1.0` being outside `@lancedb/lancedb@0.29.0`'s peer range.
- Changed `apache-arrow` to `^18.1.0` and refreshed `package-lock.json`.
- Changed `dotenv` to `^16.6.1`; this version supports the existing `quiet: true` option and avoids npm resolving a conflicting optional Stagehand peer chain.
- Removed unused `@langchain/community` and `@langchain/core` dependencies.
- Updated README and README_CN to describe the actual built-in PDF/DOCX loaders based on `pdf-parse` and `mammoth`.

## Verification

- `npm install` passed.
- `npm ls apache-arrow @lancedb/lancedb @langchain/community @langchain/core dotenv` passed and showed no LangChain packages in the dependency tree.
- `npm run typecheck` passed.
- `npm test` passed: 6 test files, 53 tests.
- `npm run build` passed.
- `node dist/tui.js --help` passed.
