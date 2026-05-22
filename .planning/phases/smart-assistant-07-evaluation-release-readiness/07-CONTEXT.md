# Phase 7: Evaluation and Release Readiness - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

将 10 个验收用例转化为可重复的评估流程，确保 v1 可靠性。

**In scope:**
- 自动化测试脚本覆盖 10 个验收用例
- Fixtures 目录包含预设测试数据
- Mock 工具用于失败场景测试
- 评估报告和发布就绪检查

**Out of scope:**
- CI/CD 集成（后续版本）
- 性能基准测试（后续版本）
- 多模型对比评估（后续版本）
- 用户反馈收集系统（后续版本）

</domain>

<decisions>
## Implementation Decisions

### Evaluation Approach
- **D-01:** 使用自动化测试脚本执行 10 个验收用例。
  - Node.js 脚本，输出通过/失败报告
  - 适合 CI 集成和回归测试
  - 每个用例独立测试，互不依赖

### Test Data Strategy
- **D-02:** 使用 Fixtures 目录存储预设测试数据。
  - 位置: `.smart-assistant/fixtures/`
  - 包含: memory/, knowledge/, sessions/ 子目录
  - 测试脚本启动前加载，测试后可清理

### Failure Simulation
- **D-03:** 添加 Mock 工具模拟失败场景。
  - 工具名: `mock_failure`
  - 调用时总是返回错误
  - 用于测试用例 8（工具失败处理）

### Long Context Testing
- **D-04:** 使用消息长度测试验证长上下文行为。
  - 发送长消息或多次对话
  - 检查响应时间和质量
  - 设置阈值: 响应时间 < 30s

### Memory vs RAG Verification
- **D-05:** 明确区分 Memory 和 RAG 测试。
  - Memory 测试用例 2、3：存储/回忆用户信息
  - RAG 测试用例 4、5：搜索本地知识
  - 验证两者数据不混淆

### Session Restore Testing
- **D-06:** 使用预存会话文件测试恢复功能。
  - Fixtures 包含完整会话数据
  - 测试脚本恢复会话后发送消息
  - 验证助手能继续对话

### Pass Threshold
- **D-07:** 8/10 用例通过即可发布。
  - 符合 REQUIREMENTS.md EVAL-02 要求
  - 允许 2 个用例因环境问题失败
  - 关键用例（Memory、RAG、Planning）必须通过

### Claude's Discretion
- 测试脚本的具体实现细节
- Fixtures 文件的具体内容格式
- 错误报告的格式和详细程度
- Mock 工具的错误消息内容

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements
- `.planning/REQUIREMENTS.md` — EVAL-01, EVAL-02, EVAL-03
- `.planning/research/SUMMARY.md` — 10 acceptance cases, tool contracts

### Prior Phase Patterns
- `.planning/phases/04-long-term-memory/04-CONTEXT.md` — Memory storage format
- `.planning/phases/smart-assistant-05-markdown-text-rag/05-CONTEXT.md` — RAG storage format
- `.planning/phases/smart-assistant-06-planning-tools/06-CONTEXT.md` — Planning storage format

### Integration Points
- `src/assistant/controller.ts` — Entry point for evaluation
- `src/tools/registry.ts` — Where to add mock_failure tool
- `src/config.ts` — DATA_SUBDIRS pattern for fixtures location

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/memory/store.ts` — Memory storage format (JSON with UUID IDs)
- `src/knowledge/store.ts` — Knowledge storage format (JSON chunks)
- `src/session/store.ts` — Session storage format
- `src/planning/store.ts` — Plan storage format

### Established Patterns
- JSON file storage with atomic writes
- Tool factory pattern with dependency injection
- System prompt integration for behavior

### Test Infrastructure
- No existing test framework (Phase 1-6 did not add tests)
- Need to add test dependencies (e.g., Node.js test runner or Vitest)

</code_context>

<acceptance_cases>
## 10 Acceptance Cases

| # | Case | Category | Test Approach |
|---|------|----------|---------------|
| 1 | 普通问答可正常响应 | Chat | 发送简单问题，验证响应 |
| 2 | 能记住长期信息 | Memory | 调用 remember，验证存储 |
| 3 | 能回忆用户偏好 | Memory | 存储后调用 recall_memory |
| 4 | 能找到本地知识 | RAG | 调用 search_knowledge |
| 5 | 检索不到时明确说不知道 | RAG | 搜索不存在内容，验证响应 |
| 6 | 能把任务拆成步骤 | Planning | 调用 create_plan |
| 7 | 能更新计划状态 | Planning | 调用 update_plan |
| 8 | 工具失败时给出可理解错误 | Error | 调用 mock_failure 工具 |
| 9 | 上下文变长时保持可用 | Long Context | 发送长消息，验证响应 |
| 10 | 旧会话恢复后能继续 | Session | 恢复会话，验证连续性 |

</acceptance_cases>

<specifics>
## Specific Ideas

- 测试脚本命名为 `eval.ts`，放在 `scripts/` 目录
- Fixtures 目录结构:
  ```
  .smart-assistant/fixtures/
  ├── memory/
  │   └── test-memory.json
  ├── knowledge/
  │   └── test-knowledge.json
  └── sessions/
      └── test-session.json
  ```
- Mock 工具返回格式: `{ error: "Mock failure for testing", type: "mock_failure" }`
- 评估报告输出到 `.planning/evaluation-report.md`

</specifics>

<deferred>
## Deferred Ideas

- CI/CD 集成 (GitHub Actions)
- 性能基准测试
- 多模型对比评估
- 自动化回归测试触发
- 评估结果可视化仪表板

</deferred>

---

*Phase: 07-evaluation-release-readiness*
*Context gathered: 2026-05-22*
