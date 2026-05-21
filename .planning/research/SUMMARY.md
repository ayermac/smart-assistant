# Research Summary: smart-assistant

**Source:** Synthesized from the initial product docs and consolidated into `.planning` on 2026-05-21.

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

## Agent Behavior Rules

- Understand the user request before deciding whether to call a tool.
- Ask a clarification question when required information is missing.
- Plan before execution for complex tasks.
- Prefer tool results over model guesses.
- Do not invent facts that are absent from local memory or the local knowledge base.
- Keep responses concise, explicit, and execution-oriented.
- Distinguish known facts, retrieved facts, and inferred conclusions when relevant.
- Use `search_knowledge` for local knowledge questions.
- Use `remember` only for explicit long-term facts or preferences.
- Use `recall_memory` for user preferences or durable historical facts.
- Use `create_plan` for complex tasks and `update_plan` when plan state changes.
- On tool failure, return an explainable error and choose a conservative fallback.

## Tool Contracts

- `remember(text, tags?)`: stores a long-term memory and returns the stored item id.
- `recall_memory(query)`: returns relevant memory entries and match reasons.
- `search_knowledge(query, topK?)`: returns snippets, source paths, and relevance signals.
- `create_plan(goal)`: returns structured steps with ids and statuses.
- `update_plan(stepId, status, note?)`: returns the updated plan state.
- `get_time(timezone?)`: returns a current time string.

All v1 tools are local by default. Write tools return explicit success/failure. Retrieval tools can return empty results.

## Evaluation Cases

1. 普通问答可正常响应。
2. 能记住一条明确写入的长期信息。
3. 能回忆用户偏好。
4. 能从本地知识库找到相关内容。
5. 检索不到时能明确说不知道。
6. 能把复杂任务拆成步骤。
7. 能在步骤变化时更新计划。
8. 工具失败时能给出可理解错误。
9. 上下文变长时仍能保持基本可用。
10. 旧会话恢复后能继续工作。

Release readiness requires at least 8 of these 10 cases to pass reliably.

## Canonical Planning Artifacts

- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/research/SUMMARY.md`
