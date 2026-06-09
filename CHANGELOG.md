# Changelog

All notable changes to Smart Assistant will be documented in this file.

## [Unreleased] - 2026-06-09

### Added
- Ink terminal UI with the `smart-assistant-tui` binary.
- Shared CLI/TUI runtime setup for sessions, data paths, and Obsidian vault sync.
- Production usage documentation for compiled `dist` entry points and installed CLI binaries.

### Fixed
- `npm install` dependency resolution by aligning `apache-arrow` with LanceDB and removing unused LangChain dependencies.
- Obsidian startup sync mtime handling so unchanged files are skipped after metadata repair.
- Legacy knowledge table schema repair for `lastModifiedMs`, avoiding LanceDB `Panic in async function` failures.
- TUI input and exit behavior during initialization; `/exit` and Ctrl+C now work while vault sync is still running.
- Installed npm binary execution when `smart-assistant` or `smart-assistant-tui` is reached through a package-manager symlink.

## [1.0.0] - 2026-05-22

### Added
- CLI interface with streaming responses
- Long-term memory storage and recall (`remember`, `recall_memory`)
- Local Markdown/text RAG search (`search_knowledge`)
- Structured task planning (`create_plan`, `update_plan`)
- Session persistence and restore
- Evaluation harness covering 10 acceptance cases
- Mock failure tool for error testing

### Features
- **Chat**: Interactive CLI conversation with streaming output
- **Memory**: Explicit fact/preference storage with keyword retrieval
- **RAG**: Local knowledge search with source citation
- **Planning**: Task decomposition with status tracking
- **Session**: Conversation history persistence

### Evaluation
- Pass rate: 100% (10/10 cases)
- All EVAL requirements met
- Release ready: YES

### Technical
- TypeScript implementation
- `pi-ai` model abstraction
- `pi-agent-core` agent loop
- JSON file storage (local-first)

### Known Limitations
- RAG limited to Markdown/text files
- No cloud sync
- CLI-only interface
- Single-user scope

---

*Smart Assistant - Local-first personal knowledge assistant*
