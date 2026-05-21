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

下一步：运行 `$gsd-plan-phase 1`，为 Phase 1 生成可执行计划。

## 设计原则

- 先做单 agent，再考虑多 agent
- 先做本地文本/Markdown，再扩展更复杂的数据源
- 先把 memory、RAG、planning 分开，再决定怎么组合
- 先保证可评测，再扩展能力
