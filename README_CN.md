# smart-assistant

> 本地优先、CLI 优先的个人 AI 助手，具备语义记忆和 RAG 能力。

[![npm version](https://img.shields.io/npm/v/smart-assistant?color=blue)](https://www.npmjs.com/package/smart-assistant)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19.0-brightgreen)](package.json)

---

## ✨ 功能特性

| 特性 | 描述 |
|------|------|
| 🧠 **长期记忆** | 使用 LanceDB + 豆包嵌入实现语义向量搜索 |
| 📚 **知识 RAG** | 混合检索：向量 + BM25 + RRF 融合，支持多模态 |
| 🔗 **Obsidian 集成** | 实时同步、双向链接解析、图片嵌入 |
| 📋 **任务规划** | 将复杂任务拆解为可跟踪的步骤 |
| 💬 **会话持久化** | 跨会话恢复对话 |
| 🔒 **本地优先** | 所有数据本地存储，无需云端 |
| ⚡ **流式 CLI** | 实时响应，可视化工具调用 |

---

## 🚀 快速开始

### 1. 安装

```bash
git clone https://github.com/your-username/smart-assistant.git
cd smart-assistant
npm install
```

### 2. 配置

创建 `.env` 文件：

```bash
# LLM 提供商（豆包/OpenAI 兼容）
SMART_ASSISTANT_PROVIDER=openai
SMART_ASSISTANT_MODEL=doubao-seed-2.0-lite
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3

# 嵌入模型（用于记忆和知识 RAG）
EMBEDDING_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3
EMBEDDING_MODEL=doubao-embedding-vision
```

### 3. 运行

```bash
npm run dev
```

### 4. 试用

```
you> 记住我的名字是小C
assistant> 好的，我已经记住啦，你的名字是小C。

you> 我叫什么名字
assistant> 根据我存储的记忆，你的名字是小C。
```

---

## ⚙️ 配置

### 环境变量

| 变量 | 描述 | 默认值 |
|------|------|--------|
| `SMART_ASSISTANT_PROVIDER` | LLM 提供商（`openai` 或 `anthropic`） | `openai` |
| `SMART_ASSISTANT_MODEL` | 模型 ID | `doubao-seed-2.0-lite` |
| `OPENAI_API_KEY` | OpenAI/豆包 API 密钥 | *必需* |
| `OPENAI_BASE_URL` | API 基础 URL | `https://ark.cn-beijing.volces.com/api/coding/v3` |
| `EMBEDDING_BASE_URL` | 嵌入 API URL | `https://ark.cn-beijing.volces.com/api/coding/v3` |
| `EMBEDDING_MODEL` | 嵌入模型（2048 维） | `doubao-embedding-vision` |
| `SMART_ASSISTANT_DATA_DIR` | 本地数据目录 | `.smart-assistant` |
| `SMART_ASSISTANT_KNOWLEDGE_DIR` | 知识源目录 | `.smart-assistant/knowledge-sources` |
| `OBSIDIAN_VAULT_PATH` | Obsidian vault 路径（可选） | *未设置* |

---

## 📚 知识 RAG

### 设置

将 Markdown 或文本文件放入知识目录：

```bash
mkdir -p knowledge-sources
cp ~/notes/*.md knowledge-sources/
```

### 构建索引

```bash
npx tsx scripts/index-knowledge.ts
```

### 使用

询问关于文档的问题：

```
you> 搜索一下关于API设计的笔记
assistant> 根据 `api-design.md > RESTful原则`，你的笔记中提到...
```

### 混合检索（v2.2）

知识 RAG 使用**混合检索**，支持**多模态**：

| 方法 | 优势 | 示例 |
|------|------|------|
| **向量搜索** | 语义理解 | "身份认证" → "authentication" |
| **BM25** | 精确关键词匹配 | "LLMRouter" → 精确匹配 |
| **RRF 融合** | 结合两种方法 | 同时出现在两个列表中的块排名更高 |
| **多模态嵌入** | 文本 + 图片融合 | 查询匹配笔记中的图片 |

**搜索流程：**
```
查询 → 向量搜索（前 20） + BM25 搜索（前 20） → RRF 融合 → 前 N 结果
```

**多模态支持：**
- Markdown 中的图片（`![](image.png)`）使用 `doubao-embedding-vision` 嵌入
- 文本 + 图片融合支持通过图片内容搜索
- 需要配置 `OBSIDIAN_VAULT_PATH` 或知识目录中包含图片

### 文本处理

- **HTML 清理**：移除 `<details>`、`<summary>`、`<br>` 标签
- **三层切块**：标题 → 段落 → 硬换行
- **重叠**：相邻块之间 80 字符重叠，保持上下文连贯
- **最大块大小**：800 字符（可配置）

支持的文件类型：`.md`、`.txt`、`.markdown`

---

## 🔗 Obsidian 集成

### 设置

配置 Obsidian vault 路径：

```bash
# 在 .env 中
OBSIDIAN_VAULT_PATH=/path/to/your/obsidian/vault
```

### 功能

当配置 `OBSIDIAN_VAULT_PATH` 后：

- **实时同步**：CLI 启动时同步 vault（增量同步，基于文件修改时间）
- **文件监听**：自动索引新建/修改/删除的文件
- **双向链接**：解析 `[[note-name]]` 引用，返回关联笔记
- **图片支持**：支持 vault 中图片的多模态嵌入
- **标签**：提取 `#tags` 和 frontmatter 标签作为元数据

### Obsidian 特定解析

| 特性 | 支持 |
|------|------|
| Markdown 文件 | ✅ |
| `[[双向链接]]` | ✅ 解析为关联笔记 |
| `![](图片)` | ✅ 多模态嵌入 |
| `#标签` | ✅ 元数据提取 |
| Frontmatter（YAML） | ✅ 已支持 |

### 工作流程

1. 启动 CLI：`npm run dev`
2. Vault 同步自动运行（显示统计信息）
3. 文件监听器开始监控变更
4. 在 Obsidian 中创建/修改/删除笔记
5. 变更自动被索引
6. 在 CLI 中查询 vault 内容

---

## 🏗️ 架构

### 技术栈

| 组件 | 技术 |
|------|------|
| 运行时 | Node.js 22+ / TypeScript |
| Agent 核心 | `pi-agent-core` + `pi-ai` |
| 向量数据库 | LanceDB（嵌入式，无需服务器） |
| 嵌入模型 | 豆包嵌入（2048 维） |
| 存储 | Apache Arrow |

### 项目结构

```
smart-assistant/
├── src/
│   ├── cli.ts              # CLI 入口
│   ├── assistant/          # Agent 控制器
│   ├── memory/             # 长期记忆（LanceDB）
│   ├── knowledge/          # 知识 RAG（LanceDB）
│   ├── planning/           # 任务规划工具
│   ├── session/            # 会话持久化
│   └── tools/              # 工具实现
├── .smart-assistant/       # 本地数据（gitignored）
│   ├── sessions/           # 对话历史
│   ├── vectors/            # LanceDB（记忆 + 知识表）
│   └── plans/              # 任务计划
└── .planning/              # 项目规划文档
```

### 数据存储

```
.smart-assistant/vectors/   # LanceDB 数据库
├── memories 表             # 长期记忆向量
└── knowledge 表            # 知识块向量
```

---

## 📊 评估

v2.2 通过所有验收标准：

| 用例 | 描述 | 状态 |
|------|------|------|
| 1 | 对话响应 | ✅ |
| 2 | 记忆存储 | ✅ |
| 3 | 记忆召回（语义） | ✅ |
| 4 | RAG 检索（语义） | ✅ |
| 5 | RAG 未命中处理 | ✅ |
| 6 | 规划分解 | ✅ |
| 7 | 规划状态更新 | ✅ |
| 8 | 工具失败处理 | ✅ |
| 9 | 长上下文 | ✅ |
| 10 | 会话恢复 | ✅ |

```bash
npm run eval  # 运行评估套件
```

---

## 🔧 开发

```bash
npm run dev        # 开发模式（热重载）
npm run build      # 生产构建
npm run typecheck  # 类型检查
npm run eval       # 运行评估
```

---

## ⚠️ 局限性

- RAG 支持 Markdown/文本文件和图片（不支持 PDF、docx、网页爬取）
- 图片需要 `doubao-embedding-vision` 或兼容的多模态嵌入模型
- 无云同步 — 数据完全本地优先
- 单用户范围（无多租户支持）
- 仅 CLI 界面（Web UI 计划在 v3 实现）

---

## 📄 许可证

MIT © 2024

---

## 🙏 致谢

- [pi-agent-core](https://github.com/earendil-works/pi-agent-core) - Agent 运行时
- [LanceDB](https://lancedb.com/) - 嵌入式向量数据库
- [Apache Arrow](https://arrow.apache.org/) - 列式数据格式
