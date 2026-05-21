# smart-assistant

本项目是一个本地优先、CLI 优先的个人知识助手 agent。

它的目标不是做一个泛聊天机器人，而是做一个能记住你的偏好、能查本地知识、能拆解任务、能稳定调用工具的助手。

## 定位

- 技术底座：TypeScript + `pi-ai` + `pi-agent-core`
- 入口形态：CLI 优先，后续可扩展 Web/API
- 数据边界：默认本地保存，知识和记忆先只做本地文本/Markdown

## 现在要做什么

先把文档补齐，再进入实现：

- [产品定义](docs/PRODUCT.md)
- [系统架构](docs/ARCHITECTURE.md)
- [Agent 规范](docs/AGENT-SPEC.md)
- [记忆与 RAG](docs/MEMORY-RAG.md)
- [工具定义](docs/TOOLS.md)
- [评测方案](docs/EVALUATION.md)
- [路线图](docs/ROADMAP.md)

## 设计原则

- 先做单 agent，再考虑多 agent
- 先做本地文本/Markdown，再扩展更复杂的数据源
- 先把 memory、RAG、planning 分开，再决定怎么组合
- 先保证可评测，再扩展能力

