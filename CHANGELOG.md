# Changelog

All notable changes to Smart Assistant will be documented in this file.

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
