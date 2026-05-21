# 工具定义

## 第一版工具清单

- `remember`
- `recall_memory`
- `search_knowledge`
- `create_plan`
- `update_plan`
- `get_time`

## 设计原则

- 工具是业务能力，不是 prompt 装饰
- 每个工具的输入输出都要简单、稳定、可测试
- 工具说明要足够清楚，让模型知道何时调用

## 建议接口

- `remember(text, tags?)`
- `recall_memory(query)`
- `search_knowledge(query, topK?)`
- `create_plan(goal)`
- `update_plan(stepId, status, note?)`
- `get_time(timezone?)`

## 工具约束

- 第一版所有工具默认本地执行
- 所有写操作都要有明确返回
- 所有检索操作都要能返回空结果

## 工具契约

- `remember`：接受结构化文本和可选标签，返回写入结果
- `recall_memory`：返回相关记忆条目和匹配原因
- `search_knowledge`：返回片段、来源和相关度
- `create_plan`：返回结构化步骤列表
- `update_plan`：返回更新后的计划状态
- `get_time`：返回当前时间字符串
