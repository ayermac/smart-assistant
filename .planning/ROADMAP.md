# Roadmap: smart-assistant

## Overview

The v1 journey starts by turning the documented product direction into a runnable TypeScript CLI project, then wires a single `pi-agent-core`/`pi-ai` agent loop, local session persistence, long-term memory, Markdown/text RAG, task planning tools, and finally an evaluation harness that proves the assistant behaves reliably.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation and CLI Skeleton** - Create the TypeScript project scaffold and terminal entry point.
- [ ] **Phase 2: Agent Runtime and Tool Loop** - Connect CLI input to `pi-agent-core`, `pi-ai`, streaming output, and the first tool registry.
- [ ] **Phase 3: Local Session Persistence** - Save and resume assistant sessions locally.
- [ ] **Phase 4: Long-term Memory** - Implement explicit remember and recall behavior.
- [ ] **Phase 5: Markdown/Text RAG** - Ingest and search local Markdown/text knowledge.
- [ ] **Phase 6: Planning Tools** - Add structured task planning and plan state updates.
- [ ] **Phase 7: Evaluation and Release Readiness** - Verify the documented acceptance cases and harden failure behavior.

## Phase Details

### Phase 1: Foundation and CLI Skeleton
**Goal**: Create a runnable TypeScript project skeleton with documented local configuration and a CLI entry that can start without the full agent stack.
**Depends on**: Nothing (first phase)
**Requirements**: [FND-01, FND-02, FND-03, FND-04]
**Success Criteria** (what must be TRUE):
  1. User can run a package script that starts the `smart-assistant` CLI.
  2. Project has TypeScript build and typecheck scripts.
  3. README explains required environment variables and local data directories.
  4. `.planning` artifacts remain aligned with the CLI-first local-first implementation boundary.
**Plans**: 3 plans

Plans:
**Wave 1**
- [x] 01-01: Add package, TypeScript config, source layout, and development scripts.

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 01-02: Implement minimal CLI command and startup flow.

**Wave 3** *(blocked on Waves 1 and 2 completion)*
- [x] 01-03: Document local setup, environment variables, and data directories.

Cross-cutting constraints:
- Phase 1 must not recreate the legacy documentation directory.
- Phase 1 must not connect to model providers; Phase 2 owns `pi-agent-core` and `pi-ai` wiring.
- Local-first defaults must keep generated data and secrets out of git.

### Phase 2: Agent Runtime and Tool Loop
**Goal**: Connect CLI messages to a single assistant agent loop using `pi-agent-core` and `pi-ai`, with streaming output and first local tool calls.
**Depends on**: Phase 1
**Requirements**: [AGT-01, AGT-02, AGT-03, AGT-04, AGT-05, AGT-06, TLS-01, TLS-02, TLS-03]
**Success Criteria** (what must be TRUE):
  1. User can send a message from the CLI and receive an assistant response.
  2. Assistant model calls go through `pi-ai`.
  3. Agent loop uses `pi-agent-core` for messages, tool calling, or event flow.
  4. CLI shows streamed response output.
  5. `get_time` or another simple local tool can be called and returned in a response.
**Plans**: 4 plans

Plans:
- [ ] 02-01: Inspect `../pi` integration points and select concrete package import strategy.
- [ ] 02-02: Implement Assistant Controller and single agent runtime wiring.
- [ ] 02-03: Implement tool registry and `get_time` tool contract.
- [ ] 02-04: Add streaming CLI output and conservative failure handling.

### Phase 3: Local Session Persistence
**Goal**: Persist assistant sessions locally and restore enough context to continue a previous conversation.
**Depends on**: Phase 2
**Requirements**: [SES-01, SES-02, SES-03]
**Success Criteria** (what must be TRUE):
  1. User can start a session and the assistant stores messages locally.
  2. User can resume the latest session or a named session id.
  3. Restored session includes prior relevant messages in the next assistant turn.
**Plans**: 3 plans

Plans:
- [ ] 03-01: Define local session storage schema and filesystem/SQLite adapter.
- [ ] 03-02: Wire session save and resume into the CLI.
- [ ] 03-03: Add session restore checks to evaluation fixtures.

### Phase 4: Long-term Memory
**Goal**: Implement explicit long-term memory write and recall while keeping it separate from session history and RAG.
**Depends on**: Phase 3
**Requirements**: [MEM-01, MEM-02, MEM-03, MEM-04, MEM-05]
**Success Criteria** (what must be TRUE):
  1. User can ask the assistant to remember a stable preference or fact.
  2. Stored memory includes text, optional tags, timestamp, and identifier.
  3. User can later ask a related question and the assistant recalls the memory.
  4. Normal conversation turns are not automatically written as long-term memory.
  5. Assistant can explain whether an answer came from memory or knowledge search when relevant.
**Plans**: 3 plans

Plans:
- [ ] 04-01: Implement memory storage and `remember` tool.
- [ ] 04-02: Implement memory retrieval and `recall_memory` tool.
- [ ] 04-03: Integrate memory context assembly and memory-specific evaluations.

### Phase 5: Markdown/Text RAG
**Goal**: Add local Markdown/text knowledge ingestion and retrieval with source-aware, conservative answering.
**Depends on**: Phase 4
**Requirements**: [RAG-01, RAG-02, RAG-03, RAG-04, RAG-05, RAG-06]
**Success Criteria** (what must be TRUE):
  1. User can point the assistant at a local Markdown/text knowledge directory.
  2. Ingestion produces chunks with source path metadata.
  3. `search_knowledge` returns relevant snippets for a query.
  4. Assistant cites or names source paths when using retrieved knowledge.
  5. Assistant says the local knowledge base did not contain an answer when search returns empty.
**Plans**: 4 plans

Plans:
- [ ] 05-01: Implement knowledge directory configuration and file discovery.
- [ ] 05-02: Implement Markdown/text chunking and local index storage.
- [ ] 05-03: Implement `search_knowledge` retrieval with source metadata.
- [ ] 05-04: Integrate RAG context and empty-result behavior into assistant responses.

### Phase 6: Planning Tools
**Goal**: Let the assistant create structured task plans, update step status, and persist plan state for continuation.
**Depends on**: Phase 5
**Requirements**: [PLN-01, PLN-02, PLN-03, PLN-04]
**Success Criteria** (what must be TRUE):
  1. User can ask for help with a complex task and receive structured steps.
  2. `create_plan` returns step ids, titles, statuses, and enough detail to act.
  3. `update_plan` changes a step status and records an optional note.
  4. Plan state can be loaded again in a later session when needed.
**Plans**: 3 plans

Plans:
- [ ] 06-01: Define plan data model and local plan storage.
- [ ] 06-02: Implement `create_plan` and `update_plan` tools.
- [ ] 06-03: Add assistant routing rules for when to plan before answering.

### Phase 7: Evaluation and Release Readiness
**Goal**: Turn the documented acceptance cases into a repeatable evaluation flow and close v1 reliability gaps.
**Depends on**: Phase 6
**Requirements**: [EVAL-01, EVAL-02, EVAL-03]
**Success Criteria** (what must be TRUE):
  1. Evaluation covers chat, memory, RAG, planning, tool failure, long context, and session restore.
  2. At least 8 of the 10 documented acceptance cases pass reliably.
  3. Memory and RAG tests prove the two concepts are not mixed.
  4. Failure scenarios return understandable errors and do not crash the CLI.
**Plans**: 3 plans

Plans:
- [ ] 07-01: Build evaluation fixtures and runner/manual script for the 10 cases.
- [ ] 07-02: Add failure-mode checks for missing knowledge, tool errors, and session restore.
- [ ] 07-03: Update README and `.planning` artifacts with current status and release-readiness notes.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation and CLI Skeleton | 3/3 | Complete | 2026-05-21 |
| 2. Agent Runtime and Tool Loop | 0/4 | Not started | - |
| 3. Local Session Persistence | 0/3 | Not started | - |
| 4. Long-term Memory | 0/3 | Not started | - |
| 5. Markdown/Text RAG | 0/4 | Not started | - |
| 6. Planning Tools | 0/3 | Not started | - |
| 7. Evaluation and Release Readiness | 0/3 | Not started | - |
