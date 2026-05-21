# Research Summary: smart-assistant

**Source:** Synthesized from `README.md` and `docs/*.md` on 2026-05-21.

## Stack

- TypeScript is the implementation language.
- `pi-ai` is the model/provider abstraction.
- `pi-agent-core` is the agent loop, message state, tool calling, and event stream base.
- CLI is the first user interface.
- Local file storage or SQLite are acceptable first storage options for session, memory, and knowledge index.

## Table Stakes

- CLI can start an interactive assistant session.
- Assistant can stream model output.
- Assistant can invoke local tools.
- Assistant can save and resume sessions.
- Assistant can write and recall explicit long-term memories.
- Assistant can search local Markdown/text knowledge.
- Assistant can create and update simple task plans.
- Assistant can fail conservatively when memory, RAG, or tools return no useful result.

## Architecture

Canonical flow:

```text
CLI
  -> Assistant Controller
  -> pi-agent-core
  -> tools
  -> pi-ai
  -> model provider
```

The Assistant Controller owns orchestration around context assembly, session persistence, memory retrieval, RAG retrieval, and tool registration. Business capability should live in tools instead of being hidden in prompts.

## Build Order

1. TypeScript project skeleton and CLI runtime.
2. Minimal `pi-ai` + `pi-agent-core` agent loop.
3. Tool contract and first local tool.
4. Session storage.
5. Memory storage and retrieval.
6. Markdown/text RAG ingestion and search.
7. Planning tools and state updates.
8. Evaluation harness covering the 10 documented acceptance cases.

## Watch Out For

- Memory and RAG are easy to blur. Memory stores durable user facts and preferences; RAG retrieves external knowledge snippets.
- Too many tools early can degrade model tool selection. Keep the first toolset fixed and small.
- RAG should return source paths and empty results explicitly so the assistant can answer conservatively.
- Planning should not directly access storage; it should consume memory/RAG/tool outputs through the controller.
- Model-provider context should be minimized because the product is local-first, not cloud-first.

## Canonical Docs

- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/AGENT-SPEC.md`
- `docs/MEMORY-RAG.md`
- `docs/TOOLS.md`
- `docs/EVALUATION.md`
- `docs/ROADMAP.md`
