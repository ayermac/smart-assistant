# smart-assistant

本项目是一个本地优先、CLI 优先的个人知识助手 agent。

它的目标不是做一个泛聊天机器人，而是做一个能记住你的偏好、能查本地知识、能拆解任务、能稳定调用工具的助手。

## 定位

- 技术底座：TypeScript + `pi-ai` + `pi-agent-core`
- 入口形态：CLI 优先，后续可扩展 Web/API
- 数据边界：默认本地保存，知识和记忆先只做本地文本/Markdown

## 当前状态

项目已经初始化为 GSD 项目，规划入口集中在 `.planning`：

- [.planning/PROJECT.md](.planning/PROJECT.md)：项目定义、核心价值、约束和关键决策
- [.planning/REQUIREMENTS.md](.planning/REQUIREMENTS.md)：v1 需求、范围边界和 phase 映射
- [.planning/ROADMAP.md](.planning/ROADMAP.md)：阶段路线图和可交付结果
- [.planning/STATE.md](.planning/STATE.md)：当前进度和会话延续状态
- [.planning/research/SUMMARY.md](.planning/research/SUMMARY.md)：架构、工具、行为规范和评测用例摘要

当前 Phase 2 已连接 `pi-agent-core` 和 `pi-ai` 的 agent runtime，支持流式输出和工具调用；下一步是进入 Phase 3，实现会话持久化和恢复。

## Quick Start

```bash
npm install
# Set your Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-...
# Or create a .env file with ANTHROPIC_API_KEY=sk-ant-...
npm run dev
npm run typecheck
npm run build
node dist/cli.js --help
```

**Required**: `ANTHROPIC_API_KEY` environment variable must be set to use the assistant.

## Local Data

默认数据目录是 `.smart-assistant`，可以通过 `SMART_ASSISTANT_DATA_DIR` 覆盖。

Phase 1 约定的子目录：

- `sessions`
- `memory`
- `knowledge`
- `plans`

`.env.example` 会列出 Phase 1 的环境变量占位。

## Phase 2 Status

Phase 2 已连接 `pi-agent-core` 和 `pi-ai` 的 agent runtime：

- CLI 使用 `pi-agent-core` 和 `pi-ai` 连接到 assistant runtime
- 支持 `ANTHROPIC_API_KEY` 环境变量进行模型调用认证
- 流式输出实时显示在 CLI 中
- `get_time` 工具可用于获取当前时间
- 工具调用状态清晰显示（带颜色标识）
- SIGINT (Ctrl+C) 可优雅中止当前操作
- 错误处理稳健，不会导致 CLI 崩溃

- `--help` 显示用法
- `--version` 显示版本
- `--data-dir` 覆盖本地数据目录
- 普通输入会发送到 agent runtime 并流式返回响应

## Evaluation

Smart Assistant v1 includes an automated evaluation suite covering 10 acceptance cases:

| Case | Description | Status |
|------|-------------|--------|
| 1 | Chat response | ✅ |
| 2 | Memory storage | ✅ |
| 3 | Memory recall | ✅ |
| 4 | RAG retrieval | ✅ |
| 5 | RAG miss handling | ✅ |
| 6 | Planning decomposition | ✅ |
| 7 | Planning status update | ✅ |
| 8 | Tool failure handling | ✅ |
| 9 | Long context | ✅ |
| 10 | Session restore | ✅ |

**Pass Rate: 10/10 (100%)** - All acceptance criteria met.

Run evaluation: `npm run eval`

## Development

```bash
# Run evaluation suite
npm run eval

# View evaluation report
cat .planning/evaluation-report.md

# View detailed evaluation summary
cat .planning/evaluation-summary.md
```

## Known Limitations

- RAG is limited to Markdown and text files (PDF, docx, web crawling excluded)
- No cloud sync - all data is local-first
- Single-user scope (no multi-tenant support)
- CLI-only interface (Web UI/API planned for v2)

## 设计原则

- 先做单 agent，再考虑多 agent
- 先做本地文本/Markdown，再扩展更复杂的数据源
- 先把 memory、RAG、planning 分开，再决定怎么组合
- 先保证可评测，再扩展能力
