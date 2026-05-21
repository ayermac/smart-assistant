# 系统架构

## 总体结构

```text
CLI
  -> Assistant Controller
  -> pi-agent-core
  -> tools
  -> pi-ai
  -> model provider
```

## 模块职责

- CLI：接收用户输入，展示流式输出，管理交互状态
- Assistant Controller：组装上下文、路由工具、持久化 session、协调 memory 和 RAG
- `pi-agent-core`：负责 agent loop、消息状态、tool calling、事件流
- tools：承载业务能力，不把逻辑写进 prompt
- `pi-ai`：统一模型和 provider 调用

## 数据流

1. 用户输入进入 CLI
2. Controller 读取当前 session、记忆和相关知识片段
3. Controller 组装 system prompt 和上下文
4. `pi-agent-core` 发起 LLM 调用
5. 模型触发工具调用
6. 工具返回结果
7. 结果写回 session、必要时写入长期记忆

## 第一版边界

- 本地文本/Markdown 作为知识源
- 本地文件或 SQLite 作为记忆存储
- 单 agent
- CLI-only

## 关键接口

- `assistant.start()`：启动一次交互回合
- `assistant.resume(sessionId)`：恢复会话
- `memory.remember(item)`：写入长期记忆
- `memory.recall(query)`：检索长期记忆
- `knowledge.search(query)`：检索本地知识
- `planner.create(goal)`：生成任务步骤
- `planner.update(stepId, status)`：更新计划状态

## 后续扩展点

- Web/API 入口
- 更复杂的 RAG 索引
- 多 agent 编排
- 云端同步存储

## 风险点

- tool 过多会让模型选择变差
- memory 和 RAG 容易混淆
- 本地知识库越大，检索策略越需要明确
- 复杂任务如果没有 planning，容易变成一轮一轮追问
