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
| 📄 **多格式支持** | Markdown、文本、PDF、DOCX 文档解析 |
| 🔗 **Obsidian 集成** | 实时同步、双向链接解析、图片嵌入 |
| 🎯 **智能重排序** | 可选 Rerank 提升检索相关性（Cohere API） |
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

# 可选：Rerank 提升检索质量
RERANK_ENABLED=false
RERANK_PROVIDER=cohere
COHERE_API_KEY=your-cohere-api-key
```

### 3. 运行

基础 readline CLI：

```bash
npm run dev
```

Ink 终端 UI：

```bash
npm run tui
```

TUI 在输入框显示后即可接收键盘输入。启动 vault 同步或运行时初始化期间，`/exit` 和 Ctrl+C 仍可退出进程；如果在助手未就绪前提交普通问题，会显示 `Assistant is still initializing.`。

构建后会提供两个入口：

```bash
npm run build
node dist/cli.js --help
node dist/tui.js --help
```

### 4. 试用

```
you> 记住我的名字是小C
assistant> 好的，我已经记住啦，你的名字是小C。

you> 我叫什么名字
assistant> 根据我存储的记忆，你的名字是小C。
```

---

## 🚢 生产环境使用

日常使用时，建议先构建一次，然后运行编译后的入口，而不是一直使用 `npm run` 脚本：

```bash
npm install
npm run build
node dist/cli.js
node dist/tui.js
```

如果希望在本机直接使用稳定命令，先对已构建的 checkout 做一次本机安装：

```bash
npm install
npm run build
npm install -g .
```

之后日常启动不再需要 `npm`：

```bash
smart-assistant
smart-assistant-tui
```

建议显式配置持久化数据目录和 Obsidian vault 路径：

```bash
export SMART_ASSISTANT_DATA_DIR="$HOME/.smart-assistant"
export OBSIDIAN_VAULT_PATH="$HOME/Obsidian/SecondBrain"
smart-assistant-tui
```

生产使用说明：
- `npm run dev` 和 `npm run tui` 是开发快捷方式。
- `smart-assistant` 启动基础 readline CLI。
- `smart-assistant-tui` 启动 Ink 终端 UI。
- 拉取代码变更后，重新执行 `npm run build`；只有全局命令链接缺失或指向其他位置时才需要重新安装。

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
| `EMBEDDING_TIMEOUT_MS` | 嵌入 API 请求超时 | `30000` |
| `SMART_ASSISTANT_DATA_DIR` | 本地数据目录 | `.smart-assistant` |
| `SMART_ASSISTANT_KNOWLEDGE_DIR` | 知识源目录 | `.smart-assistant/knowledge-sources` |
| `SMART_ASSISTANT_KNOWLEDGE_TIMEOUT_MS` | `search_knowledge` 单步超时 | `45000` |
| `OBSIDIAN_VAULT_PATH` | Obsidian vault 路径（可选） | *未设置* |
| `RERANK_ENABLED` | 启用 Rerank 重排序 | `false` |
| `RERANK_PROVIDER` | Rerank 提供商（`cohere` 或 `noop`） | `cohere` |
| `COHERE_API_KEY` | Cohere API 密钥（Rerank 必需） | *未设置* |

---

## 📚 知识 RAG

### 设置

将文档放入知识目录：

```bash
mkdir -p knowledge-sources
cp ~/notes/*.md knowledge-sources/
cp ~/documents/*.pdf knowledge-sources/
cp ~/reports/*.docx knowledge-sources/
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

### 混合检索（v2.3）

知识 RAG 使用**混合检索**，支持**多模态**和**多格式**：

| 方法 | 优势 | 示例 |
|------|------|------|
| **向量搜索** | 语义理解 | "身份认证" → "authentication" |
| **BM25** | 精确关键词匹配 | "LLMRouter" → 精确匹配 |
| **RRF 融合** | 结合两种方法 | 同时出现在两个列表中的块排名更高 |
| **多模态嵌入** | 文本 + 图片融合 | 查询匹配笔记中的图片 |
| **Rerank** | 语义重排序 | 使用 Cohere API 提升 Top-K 相关性 |

**搜索流程：**
```
查询 → 向量搜索 + BM25 → RRF 融合 → [Rerank] → 前 N 结果
```

**多模态支持：**
- Markdown 中的图片（`![](image.png)`）使用 `doubao-embedding-vision` 嵌入
- 文本 + 图片融合支持通过图片内容搜索
- 需要配置 `OBSIDIAN_VAULT_PATH` 或知识目录中包含图片

### 支持的文件格式

| 格式 | 扩展名 | 解析器 |
|------|--------|--------|
| Markdown | `.md`, `.markdown` | 内置解析器 |
| 文本 | `.txt` | 内置解析器 |
| PDF | `.pdf` | 内置加载器 (pdf-parse) |
| Word | `.docx` | 内置加载器 (mammoth) |
| 图片 | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` | 多模态嵌入 |

### 文本处理

- **HTML 清理**：移除 `<details>`、`<summary>`、`<br>` 标签
- **三层切块**：标题 → 段落 → 硬换行
- **重叠**：相邻块之间 80 字符重叠，保持上下文连贯
- **最大块大小**：800 字符（可配置）

### Rerank 配置

启用 Rerank 可提升检索结果相关性：

```bash
# 在 .env 中
RERANK_ENABLED=true
RERANK_PROVIDER=cohere
COHERE_API_KEY=your-cohere-api-key
```

**工作原理：**
1. 混合检索返回候选结果（如 Top 20）
2. Rerank 模型对每个候选计算精确相关性分数
3. 按相关性重新排序，返回 Top N

**效果：**
- 提升长查询的检索精度
- 改善语义相近但关键词不同的匹配
- 需要额外 API 调用（Cohere Rerank API）

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

启动同步是增量的。如果从旧版本地 LanceDB 表升级，第一次启动可能会对已有 vault 文件重索引一次，用来回填可靠的毫秒级修改时间元数据。之后未修改文件时再次启动，应显示 vault 已是最新状态。

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
6. 在 CLI 或 TUI 中查询 vault 内容

验证启动增量同步：不修改 vault，连续运行两次 `npm run tui` 或 `npm run dev`。升级后的第一次可能显示 `Reindexing` 修复旧元数据；第二次应显示 `Vault already up to date`。

如果 TUI 在 vault 同步期间仍显示初始化中，输入框仍可交互。可使用 `/exit` 或 Ctrl+C 直接退出，无需等待初始化结束。

---

## 🏗️ 架构

### 技术栈

| 组件 | 技术 |
|------|------|
| 运行时 | Node.js 22+ / TypeScript |
| Agent 核心 | `pi-agent-core` + `pi-ai` |
| 向量数据库 | LanceDB（嵌入式，无需服务器） |
| 嵌入模型 | 豆包嵌入（2048 维） |
| 文档解析 | 基于 pdf-parse 和 mammoth 的内置加载器 |
| 重排序 | Cohere Rerank API |
| 存储 | Apache Arrow |

### 项目结构

```
smart-assistant/
├── src/
│   ├── cli.ts              # CLI 入口
│   ├── tui.tsx             # Ink 终端 UI 入口
│   ├── runtime.ts          # CLI/TUI 共享运行时辅助逻辑
│   ├── assistant/          # Agent 控制器
│   ├── memory/             # 长期记忆（LanceDB）
│   ├── knowledge/          # 知识 RAG（LanceDB）
│   │   ├── loaders/        # 文档加载器（PDF, DOCX）
│   │   ├── rerank/         # 重排序模块
│   │   └── obsidian.ts     # Obsidian 解析
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
└── knowledge 表            # 知识块向量（含 imageVector）
```

### 知识块结构

```typescript
interface KnowledgeChunk {
  id: string;              // 唯一标识
  text: string;            // 文本内容
  vector: number[];        // 文本嵌入向量（2048 维）
  imageVector?: number[];  // 图片嵌入向量（2048 维，可选）
  sourcePath: string;      // 源文件路径
  heading?: string;        // 所属标题
  tags: string[];          // 标签
  linkedNotes?: string[];  // 关联笔记（Obsidian）
  createdAt: Date;         // 创建时间
}
```

---

## 📊 评估

v2.3 通过所有验收标准：

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
npm run tui        # Ink 终端 UI
npm run build      # 生产构建
npm run typecheck  # 类型检查
npm run eval       # 运行评估
npm test           # 运行测试
```

---

## ⚠️ 局限性

- PDF/DOCX 文档需要安装对应依赖（`pdf-parse`、`mammoth`）
- 图片需要 `doubao-embedding-vision` 或兼容的多模态嵌入模型
- 无云同步 — 数据完全本地优先
- 单用户范围（无多租户支持）
- 仅终端界面：readline CLI 和 Ink TUI。Web UI 计划在 v3 实现。

---

## 📝 更新日志

### Unreleased (2026-06-09)

**新功能：**
- 新增 Ink 终端 UI，并提供 `smart-assistant-tui` 二进制入口。
- 新增 CLI/TUI 共享运行时初始化，用于会话、数据路径和 vault 同步。

**修复：**
- 修复 `npm install` 依赖解析问题：对齐 `apache-arrow` 与 LanceDB 的 peer 范围，并移除未使用的 LangChain 依赖。
- 稳定 Obsidian 启动同步，使用可靠的毫秒级 mtime 元数据。
- 修复旧 knowledge 表 schema 不兼容导致 LanceDB `Panic in async function` 的问题。
- 修复 TUI 初始化期间的输入和退出行为；vault 同步仍在运行时，`/exit` 和 Ctrl+C 也可退出。
- 修复通过包管理器符号链接运行 `smart-assistant` / `smart-assistant-tui` 时入口没有执行的问题。
- 为 `search_knowledge` 增加中断传播、进度提示和超时，避免 embedding/search 调用过慢时 TUI 一直停在 responding。
- 优化 TUI 对话输出排版：固定前缀栏、自动换行、来源引用美化，并对列表续行缩进。

**文档：**
- 补充通过编译后的 `dist` 入口和安装后的 CLI 二进制进行生产使用的说明。
- 补充 TUI 启动输入行为和 Obsidian 增量同步验证说明。

### v2.3 (2026-05-26)

**新功能：**
- 📄 PDF 文档支持（通过 pdf-parse）
- 📄 DOCX 文档支持（通过 mammoth）
- 🎯 可选 Rerank 重排序（Cohere API）
- 🖼️ 修复图片嵌入检索 bug

**改进：**
- 优化混合检索流程，支持 Rerank 后处理
- 扩展文件格式支持表
- 更新知识块结构，包含 `imageVector` 字段

### v2.2 (2026-05-23)

- 混合检索：向量 + BM25 + RRF 融合
- Obsidian 集成：实时同步、双向链接、图片嵌入
- 三层切块策略：标题 → 段落 → 硬换行

### v2.0 (2026-05-22)

- 向量搜索（LanceDB + 豆包嵌入）
- 长期记忆工具
- 知识 RAG 工具
- 任务规划工具

---

## 📄 许可证

MIT © 2024

---

## 🙏 致谢

- [pi-agent-core](https://github.com/earendil-works/pi-agent-core) - Agent 运行时
- [LanceDB](https://lancedb.com/) - 嵌入式向量数据库
- [Apache Arrow](https://arrow.apache.org/) - 列式数据格式
- [Cohere](https://cohere.com/) - Rerank API
