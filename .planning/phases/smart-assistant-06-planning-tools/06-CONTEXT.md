# Phase 6: Planning Tools - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

让助手创建结构化任务计划、更新步骤状态、持久化计划状态。用户可以让助手把复杂任务拆成可执行步骤，并在后续继续推进。

**In scope:**
- `create_plan` 工具把用户目标转成结构化步骤
- `update_plan` 工具更新步骤状态和备注
- 系统提示引导助手对复杂任务先规划再执行
- 计划状态持久化到本地文件
- 单计划模式（同一时间一个活跃计划）

**Out of scope:**
- 多计划管理（切换、归档）
- 计划模板或预设
- 计划分享或协作
- 计划与日历/提醒集成
- 子计划或计划依赖

</domain>

<decisions>
## Implementation Decisions

### Plan Schema
- **D-01:** 使用最小字段结构：id, title, status, steps[]。
  - Plan: id, title, status, steps, createdAt, updatedAt
  - Step: id, title, status, note (optional)
  - 满足 PLN-01/02 最低要求，简单直接

### Step Status
- **D-02:** 使用三种状态：pending, in_progress, completed。
  - 简单明确，覆盖常见场景
  - v1 不需要 blocked、skipped 等复杂状态

### Planning Trigger
- **D-03:** 通过系统提示引导助手对复杂任务先规划。
  - 在系统提示中说明：复杂任务先使用 create_plan 规划
  - 让 LLM 自行判断何为"复杂任务"
  - 不实现关键词触发逻辑（过度工程）

### Multi-Plan Policy
- **D-04:** v1 采用单计划模式。
  - 同一时间只有一个活跃计划
  - create_plan 覆盖之前的计划
  - 简化实现，v1 够用

### Storage
- **D-05:** 使用 JSON 文件存储，与 Memory/Knowledge 一致。
  - 单个计划存为 `{dataDir}/plans/current-plan.json`
  - 单计划模式不需要 manifest
  - 使用原子写入模式

### Claude's Discretion
- Plan ID 生成方式（UUID 或 timestamp）
- Step ID 生成方式
- 空计划响应文案
- update_plan 返回格式

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements
- `.planning/REQUIREMENTS.md` — PLN-01 through PLN-04
- `.planning/research/SUMMARY.md` — Tool contracts, agent behavior rules

### Prior Phase Patterns
- `.planning/phases/04-long-term-memory/04-CONTEXT.md` — Tool factory pattern with dependency injection
- `.planning/phases/smart-assistant-05-markdown-text-rag/05-CONTEXT.md` — Storage and tool patterns
- `src/memory/types.ts` — Store interface pattern to follow for PlanStore
- `src/tools/memory.ts` — Tool factory pattern

### Configuration
- `src/config.ts` — DATA_SUBDIRS pattern, add `plans` subdirectory

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/memory/types.ts` + `src/memory/store.ts` — MemoryStore interface and FileMemoryStore pattern
- `src/tools/memory.ts` — Tool factory pattern with Typebox schema
- `src/tools/registry.ts` — createAllTools factory, add planning tools
- `src/config.ts` — DATA_SUBDIRS, add `plans` subdirectory

### Established Patterns
- JSON file storage with atomic writes
- Tool factory with dependency injection
- Typebox schema for parameters
- System prompt integration for tool behavior

### Integration Points
- `src/tools/registry.ts`: Add planStore parameter, register planning tools
- `src/assistant/controller.ts`: Create PlanStore, pass to createAllTools, update system prompt
- `src/config.ts`: Add `plans` to DATA_SUBDIRS

</code_context>

<specifics>
## Specific Ideas

- create_plan 返回格式：列出所有步骤，方便用户确认
- update_plan 返回格式：显示更新后的步骤状态
- 系统提示示例："对于复杂任务，先用 create_plan 把任务拆成步骤，然后逐步执行"

</specifics>

<deferred>
## Deferred Ideas

- 多计划管理（切换、归档、删除）
- 计划模板或预设
- 子计划或计划依赖
- 计划过期或清理
- 计划导出/分享

</deferred>

---

*Phase: 06-planning-tools*
*Context gathered: 2026-05-22*
