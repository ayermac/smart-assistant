# smart-assistant

> A local-first, CLI-first personal AI assistant with semantic memory and RAG capabilities.

[![npm version](https://img.shields.io/npm/v/smart-assistant?color=blue)](https://www.npmjs.com/package/smart-assistant)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19.0-brightgreen)](package.json)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🧠 **Long-term Memory** | Semantic vector search with LanceDB + Doubao embeddings |
| 📚 **Knowledge RAG** | Hybrid retrieval: vector + BM25 + RRF fusion, multimodal support |
| 🔗 **Obsidian Integration** | Real-time sync, wiki-links parsing, image embedding |
| 📋 **Task Planning** | Break down complex tasks into trackable steps |
| 💬 **Session Persistence** | Resume conversations across sessions |
| 🔒 **Local-First** | All data stored locally, no cloud required |
| ⚡ **Streaming CLI** | Real-time responses with tool call visualization |

---

## 🚀 Quick Start

### 1. Install

```bash
git clone https://github.com/your-username/smart-assistant.git
cd smart-assistant
npm install
```

### 2. Configure

Create `.env` file:

```bash
# LLM Provider (Doubao/OpenAI-compatible)
SMART_ASSISTANT_PROVIDER=openai
SMART_ASSISTANT_MODEL=doubao-seed-2.0-lite
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3

# Embeddings (for Memory and Knowledge RAG)
EMBEDDING_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3
EMBEDDING_MODEL=doubao-embedding-vision
```

### 3. Run

```bash
npm run dev
```

### 4. Try It

```
you> 记住我的名字是小C
assistant> 好的，我已经记住啦，你的名字是小C。

you> 我叫什么名字
assistant> 根据我存储的记忆，你的名字是小C。
```

---

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SMART_ASSISTANT_PROVIDER` | LLM provider (`openai` or `anthropic`) | `openai` |
| `SMART_ASSISTANT_MODEL` | Model ID | `doubao-seed-2.0-lite` |
| `OPENAI_API_KEY` | API key for OpenAI/Doubao | *required* |
| `OPENAI_BASE_URL` | API base URL | `https://ark.cn-beijing.volces.com/api/coding/v3` |
| `EMBEDDING_BASE_URL` | Embedding API URL | `https://ark.cn-beijing.volces.com/api/coding/v3` |
| `EMBEDDING_MODEL` | Embedding model (2048-dim) | `doubao-embedding-vision` |
| `SMART_ASSISTANT_DATA_DIR` | Local data directory | `.smart-assistant` |
| `SMART_ASSISTANT_KNOWLEDGE_DIR` | Knowledge source directory | `.smart-assistant/knowledge-sources` |
| `OBSIDIAN_VAULT_PATH` | Obsidian vault path (optional) | *not set* |

---

## 📚 Knowledge RAG

### Setup

Put your Markdown or text files in the knowledge directory:

```bash
mkdir -p knowledge-sources
cp ~/notes/*.md knowledge-sources/
```

### Build Index

```bash
npx tsx scripts/index-knowledge.ts
```

### Usage

Ask questions about your documents:

```
you> 搜索一下关于API设计的笔记
assistant> According to `api-design.md > RESTful原则`，你的笔记中提到...
```

### Hybrid Retrieval (v2.2)

Knowledge RAG uses **hybrid retrieval** with **multimodal support**:

| Method | Strength | Example |
|--------|----------|---------|
| **Vector Search** | Semantic understanding | "身份认证" → "authentication" |
| **BM25** | Exact keyword matching | "LLMRouter" → exact matches |
| **RRF Fusion** | Combines both methods | Chunks in both lists rank higher |
| **Multimodal Embedding** | Text + Image fusion | Query matches images in notes |

**Search Pipeline:**
```
query → vector search (top 20) + BM25 search (top 20) → RRF fusion → top N
```

**Multimodal Support:**
- Images in Markdown (`![](image.png)`) are embedded using `doubao-embedding-vision`
- Text + Image fusion enables searching by image content
- Requires `OBSIDIAN_VAULT_PATH` or images in knowledge directory

### Text Processing

- **HTML Cleaning**: Removes `<details>`, `<summary>`, `<br>` tags
- **Three-Layer Chunking**: Heading → Paragraph → Hard break
- **Overlap**: 80-char overlap between adjacent chunks for context continuity
- **Max Chunk Size**: 800 characters (configurable)

Supported file types: `.md`, `.txt`, `.markdown`

---

## 🔗 Obsidian Integration

### Setup

Configure your Obsidian vault path:

```bash
# In .env
OBSIDIAN_VAULT_PATH=/path/to/your/obsidian/vault
```

### Features

When `OBSIDIAN_VAULT_PATH` is configured:

- **Real-time Sync**: CLI syncs vault on startup (incremental, based on file modification times)
- **File Watching**: Automatically indexes new/modified/deleted files
- **Wiki Links**: Parses `[[note-name]]` references for linked note retrieval
- **Images**: Supports multimodal embedding for images in vault
- **Tags**: Extracts `#tags` and frontmatter tags for metadata

### Obsidian-Specific Parsing

| Feature | Support |
|---------|---------|
| Markdown files | ✅ |
| `[[wiki-links]]` | ✅ Parsed as linked notes |
| `![](images)` | ✅ Multimodal embedding |
| `#tags` | ✅ Metadata extraction |
| Frontmatter (YAML) | ✅ Already supported |

### Workflow

1. Start CLI: `npm run dev`
2. Vault sync runs automatically (shows stats)
3. File watcher starts monitoring changes
4. Create/modify/delete notes in Obsidian
5. Changes are indexed automatically
6. Query your vault in CLI

---

## 🏗️ Architecture

### Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 22+ / TypeScript |
| Agent Core | `pi-agent-core` + `pi-ai` |
| Vector DB | LanceDB (embedded, no server) |
| Embeddings | Doubao embedding (2048-dim) |
| Storage | Apache Arrow |

### Project Structure

```
smart-assistant/
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── assistant/          # Agent controller
│   ├── memory/             # Long-term memory (LanceDB)
│   ├── knowledge/          # Knowledge RAG (LanceDB)
│   ├── planning/           # Task planning tools
│   ├── session/            # Session persistence
│   └── tools/              # Tool implementations
├── .smart-assistant/       # Local data (gitignored)
│   ├── sessions/           # Conversation history
│   ├── vectors/            # LanceDB (memory + knowledge tables)
│   └── plans/              # Task plans
└── .planning/              # Project planning docs
```

### Data Storage

```
.smart-assistant/vectors/   # LanceDB database
├── memories table          # Long-term memory vectors
└── knowledge table         # Knowledge chunk vectors
```

---

## 📊 Evaluation

v2.2 passes all acceptance criteria:

| Case | Description | Status |
|------|-------------|--------|
| 1 | Chat response | ✅ |
| 2 | Memory storage | ✅ |
| 3 | Memory recall (semantic) | ✅ |
| 4 | RAG retrieval (semantic) | ✅ |
| 5 | RAG miss handling | ✅ |
| 6 | Planning decomposition | ✅ |
| 7 | Planning status update | ✅ |
| 8 | Tool failure handling | ✅ |
| 9 | Long context | ✅ |
| 10 | Session restore | ✅ |

```bash
npm run eval  # Run evaluation suite
```

---

## 🔧 Development

```bash
npm run dev        # Development mode (hot reload)
npm run build      # Production build
npm run typecheck  # Type checking
npm run eval       # Run evaluations
```

---

## ⚠️ Limitations

- RAG supports Markdown/text files and images (no PDF, docx, web crawling)
- Images require `doubao-embedding-vision` or compatible multimodal embedding model
- No cloud sync — all data is local-first
- Single-user scope (no multi-tenant support)
- CLI-only interface (Web UI planned for v3)

---

## 📄 License

MIT © 2024

---

## 🙏 Acknowledgments

- [pi-agent-core](https://github.com/earendil-works/pi-agent-core) - Agent runtime
- [LanceDB](https://lancedb.com/) - Embedded vector database
- [Apache Arrow](https://arrow.apache.org/) - Columnar data format
