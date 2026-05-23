# smart-assistant

## What This Is

`smart-assistant` 是一个本地优先、CLI 优先的个人知识助手 agent。它面向需要管理个人笔记、长期偏好和日常任务的人，用 TypeScript、`pi-ai` 和 `pi-agent-core` 构建一个可控、可审计、可评测的本地助手。

第一版不追求通用聊天产品，而是先跑通 CLI 对话、工具调用、会话恢复、长期记忆、本地 Markdown/text RAG 和简单任务规划。

## Core Value

用户可以在 CLI 里用一个稳定入口，让助手记住明确的长期信息、检索本地知识，并把任务拆解成可执行步骤。

## Requirements

### Validated

- [x] CLI 可以启动并持续进行对话。(Phase 2)
- [x] agent loop 基于 `pi-agent-core` 运行，并通过 `pi-ai` 调用模型 provider。(Phase 2)
- [x] 助手可以流式输出回答。(Phase 2)
- [x] 工具调用链路可以运行至少一个本地工具。(Phase 2)
- [x] 会话可以保存并在后续恢复。(Phase 3)
- [x] 用户可以明确写入长期记忆。(Phase 4)
- [x] 助手可以根据查询回忆长期记忆（语义向量检索）。(Phase 4)
- [x] 助手可以 ingest 本地 Markdown/text 文件并建立索引。(Phase 5)
- [x] 助手可以从本地知识库检索相关片段并用于回答。(Phase 5/8)
- [x] 检索不到结果时，助手会明确说明缺口，不编造本地知识。(Phase 5)
- [x] 助手可以把复杂任务拆成结构化步骤。(Phase 6)
- [x] 助手可以更新计划步骤状态。(Phase 6)
- [x] 10 个验收用例中至少 8 个可以稳定通过。(Phase 7)
- [x] Knowledge RAG 支持语义向量检索（LanceDB + Doubao embedding）。(Phase 8)

### Active

(None — all v1/v2 requirements validated)

### Out of Scope

- 通用聊天产品 — 项目定位是个人知识助手，不以开放域闲聊作为主价值。
- 多租户 SaaS — 第一版默认单用户、本地存储。
- 默认云同步 — 数据默认保存在本机，只把必要上下文发送给模型 provider。
- Web UI/API — 第一版只规划 CLI，后续可选扩展。
- PDF/docx/网页抓取 — RAG 第一版只支持本地 Markdown/text。
- 浏览器自动化或桌面自动化 — 第一版工具只做本地助手核心能力。
- 多 agent 协作 — 第一版先做单 agent，避免范围失控。

## Context

项目规划统一收口到 GSD `.planning` 目录。v2.0 已完成所有 8 个 Phase，实现 CLI agent、会话持久化、长期记忆（LanceDB 向量检索）、Knowledge RAG（LanceDB 向量检索）、任务规划和验收测试。

- `.planning/PROJECT.md`：项目定位、核心价值、约束和关键决策。
- `.planning/REQUIREMENTS.md`：v1 需求、v2 延后项、非目标和 traceability。
- `.planning/ROADMAP.md`：从 CLI skeleton 到 agent runtime、session、memory、RAG、planning、evaluation、vector search 的阶段路线。
- `.planning/research/SUMMARY.md`：架构、工具、agent 行为规范、评测用例和实现注意事项。
- `.planning/STATE.md`：当前 phase、进度、延后项和会话延续状态。

运行时参考项目：

- `../pi` 提供 `pi-ai`、`pi-agent-core`、`pi-coding-agent`、`pi-tui` 的实现参考。
- `../hello-agents` 提供 ReAct、planning、reflection、memory/RAG 的学习范式参考。
- `../awesome-agentic-ai-zh` 提供 agent 学习路线、context engineering、RAG/memory 概念参考。

## Constraints

- **Tech stack**: TypeScript 是实现主线，`pi-ai` 和 `pi-agent-core` 是落地技术底座。
- **Entry point**: 第一版只做 CLI，不做 Web UI。
- **Data locality**: session、memory、knowledge index 默认保存在本机。
- **Provider boundary**: 只把必要上下文发送给模型 provider。
- **RAG scope**: 第一版只支持本地 Markdown/text，不支持 PDF、docx、网页抓取或云同步。
- **Agent topology**: 第一版单 agent，不做多 agent 编排。
- **Concept boundary**: Memory、RAG、Planning、Tools 必须保持职责分离。
- **Language**: 产品和规划文档使用中文，代码/API 名称保留英文。

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CLI-first | 先验证 agent loop、memory、RAG、planning 的核心体验，避免 UI 提前放大范围 | ✅ Phase 2 delivered streaming CLI |
| Local-first | 用户希望知识、记忆和会话默认可控、可审计 | ✅ All data in `.smart-assistant/` |
| TypeScript + `pi-ai` + `pi-agent-core` | 与参考项目 `pi` 对齐，降低集成不确定性 | ✅ Phase 2 wired agent runtime |
| Markdown/text RAG only in v1 | 本地文本知识库能覆盖第一版目标，避免文档解析范围失控 | ✅ Phase 5 delivered chunking + retrieval |
| Memory and RAG separated | 长期事实和知识文档的生命周期、来源、更新方式不同 | ✅ Separate stores, separate tools |
| Single-agent MVP | 先把工具选择和状态管理跑稳，再考虑多 agent | ✅ Phase 2-6 delivered single agent |
| LanceDB for vector storage | Embedded vector DB, no server required, Apache Arrow backend | ✅ Phase 4/8 delivered Memory + Knowledge vector search |
| Doubao embedding (2048-dim) | High-quality Chinese + English semantic understanding | ✅ Phase 4/8 delivered semantic retrieval |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-23 after completing Phase 8 (Knowledge RAG Vector Search)*
