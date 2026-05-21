# Requirements: smart-assistant

**Defined:** 2026-05-21
**Core Value:** 用户可以在 CLI 里用一个稳定入口，让助手记住明确的长期信息、检索本地知识，并把任务拆解成可执行步骤。

## v1 Requirements

Requirements for the first local-first CLI assistant release. Each requirement maps to exactly one roadmap phase.

### Foundation

- [ ] **FND-01**: Project has a TypeScript runtime scaffold with package scripts for local development, build, typecheck, and CLI execution.
- [ ] **FND-02**: Project has a CLI entry that can start the assistant from the terminal.
- [ ] **FND-03**: Project documents required environment variables and local data directories.
- [ ] **FND-04**: Project keeps `.planning` artifacts and README aligned with implementation scope.

### Agent Runtime

- [ ] **AGT-01**: CLI can send a user message into a single assistant agent loop.
- [ ] **AGT-02**: Agent loop uses `pi-agent-core` for message state, tool calling, and event flow.
- [ ] **AGT-03**: Model calls go through `pi-ai` instead of direct provider-specific code.
- [ ] **AGT-04**: Assistant can stream response text to the CLI.
- [ ] **AGT-05**: Assistant can call at least one local tool and include the tool result in the response.
- [ ] **AGT-06**: Assistant follows the behavior rules in `.planning/research/SUMMARY.md`, including clarification and conservative failure behavior.

### Session

- [ ] **SES-01**: Assistant persists session messages and minimal session metadata locally.
- [ ] **SES-02**: User can resume a previous session by session id or latest-session default.
- [ ] **SES-03**: Restored sessions include enough context for the assistant to continue coherently.

### Memory

- [ ] **MEM-01**: User can ask the assistant to remember an explicit long-term fact or preference.
- [ ] **MEM-02**: `remember` stores long-term memory locally with text, optional tags, timestamps, and an identifier.
- [ ] **MEM-03**: `recall_memory` can retrieve relevant memories for a query.
- [ ] **MEM-04**: Assistant does not store every conversation turn as long-term memory.
- [ ] **MEM-05**: Assistant distinguishes memory results from RAG knowledge in responses and internal context.

### Knowledge

- [ ] **RAG-01**: User can configure or point the assistant at a local Markdown/text knowledge directory.
- [ ] **RAG-02**: Assistant can ingest Markdown/text files into chunks with source path metadata.
- [ ] **RAG-03**: `search_knowledge` can return relevant chunks for a query.
- [ ] **RAG-04**: Search results include source path, snippet text, and a relevance signal.
- [ ] **RAG-05**: When no relevant knowledge is found, assistant states that the local knowledge base did not contain the answer.
- [ ] **RAG-06**: v1 RAG excludes PDF, docx, web crawling, cloud sync, and graph retrieval.

### Planning

- [ ] **PLN-01**: `create_plan` can turn a user goal into structured steps.
- [ ] **PLN-02**: `update_plan` can update a step status and optional note.
- [ ] **PLN-03**: Assistant chooses planning before execution for complex tasks.
- [ ] **PLN-04**: Plan state is persisted locally when needed for later continuation.

### Tools

- [ ] **TLS-01**: Tool registry exposes `remember`, `recall_memory`, `search_knowledge`, `create_plan`, `update_plan`, and `get_time`.
- [ ] **TLS-02**: Every v1 tool has a stable input/output contract that can return success, empty result, or explainable error.
- [ ] **TLS-03**: Tool implementations are local by default and do not require cloud services beyond model-provider calls.

### Evaluation

- [ ] **EVAL-01**: Project has an evaluation harness or manual script covering the 10 cases in `.planning/research/SUMMARY.md`.
- [ ] **EVAL-02**: At least 8 of 10 acceptance cases pass reliably for the v1 release.
- [ ] **EVAL-03**: Evaluation distinguishes chat, memory, RAG, planning, tool failure, and session restore behavior.

## v2 Requirements

Deferred to future releases. Tracked but not in current roadmap.

### Interfaces

- **WEB-01**: Optional Web UI can reuse the Assistant Controller without changing core agent behavior.
- **API-01**: Optional local API can expose the assistant for other local tools.

### Retrieval

- **RAG2-01**: Assistant can upgrade from keyword search to embeddings and vector storage.
- **RAG2-02**: Assistant can support additional document types such as PDF or docx.
- **RAG2-03**: Assistant can support web ingestion or cloud knowledge sync.

### Agent Collaboration

- **MAG-01**: Assistant can optionally use multiple agents for specialized workflows.

## Out of Scope

Explicitly excluded from v1. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| General-purpose chat product | Not the core value; the product is a personal knowledge assistant |
| Multi-tenant SaaS | Local-first single-user scope keeps storage and security simple |
| Default cloud sync | Conflicts with local-first data boundary |
| Web UI/API | CLI must prove the core loop before more interfaces |
| PDF/docx/web crawling | RAG v1 is intentionally limited to Markdown/text |
| Browser or desktop automation | Not needed for memory, RAG, planning MVP |
| Multi-agent orchestration | Single-agent loop must be stable first |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 | Pending |
| FND-02 | Phase 1 | Pending |
| FND-03 | Phase 1 | Pending |
| FND-04 | Phase 1 | Pending |
| AGT-01 | Phase 2 | Pending |
| AGT-02 | Phase 2 | Pending |
| AGT-03 | Phase 2 | Pending |
| AGT-04 | Phase 2 | Pending |
| AGT-05 | Phase 2 | Pending |
| AGT-06 | Phase 2 | Pending |
| SES-01 | Phase 3 | Pending |
| SES-02 | Phase 3 | Pending |
| SES-03 | Phase 3 | Pending |
| MEM-01 | Phase 4 | Pending |
| MEM-02 | Phase 4 | Pending |
| MEM-03 | Phase 4 | Pending |
| MEM-04 | Phase 4 | Pending |
| MEM-05 | Phase 4 | Pending |
| RAG-01 | Phase 5 | Pending |
| RAG-02 | Phase 5 | Pending |
| RAG-03 | Phase 5 | Pending |
| RAG-04 | Phase 5 | Pending |
| RAG-05 | Phase 5 | Pending |
| RAG-06 | Phase 5 | Pending |
| PLN-01 | Phase 6 | Pending |
| PLN-02 | Phase 6 | Pending |
| PLN-03 | Phase 6 | Pending |
| PLN-04 | Phase 6 | Pending |
| TLS-01 | Phase 2 | Pending |
| TLS-02 | Phase 2 | Pending |
| TLS-03 | Phase 2 | Pending |
| EVAL-01 | Phase 7 | Pending |
| EVAL-02 | Phase 7 | Pending |
| EVAL-03 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0

---
*Requirements defined: 2026-05-21*
*Last updated: 2026-05-21 after consolidating planning into .planning/*
