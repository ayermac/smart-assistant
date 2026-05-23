# smart-assistant

> A local-first, CLI-first personal AI assistant with long-term memory and RAG capabilities.

[![npm version](https://img.shields.io/npm/v/smart-assistant?color=blue)](https://www.npmjs.com/package/smart-assistant)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19.0-brightgreen)](package.json)

**Quick Start** · **Features** · **Configuration** · **Tech Stack**

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🧠 **Long-term Memory** | Semantic vector search with LanceDB + Doubao embeddings (2048-dim) |
| 📚 **Knowledge RAG** | Semantic vector search over local Markdown/text files |
| 📋 **Task Planning** | Break down complex tasks into trackable steps |
| 💬 **Session Persistence** | Resume conversations across sessions |
| 🔒 **Local-First** | All data stored locally, no cloud required |
| ⚡ **Streaming CLI** | Real-time responses with tool call visualization |

---

## 🚀 Quick Start

```bash
# Clone and install
git clone https://github.com/your-username/smart-assistant.git
cd smart-assistant
npm install

# Set your API key
export OPENAI_API_KEY=your-api-key
# Or create .env file with OPENAI_API_KEY=your-api-key

# Run
npm run dev
```

**First conversation:**
```
you> 记住我的名字是小C
assistant> 好的，我已经记住啦，你的名字是小C。

you> 我叫什么名字
assistant> 根据我存储的记忆，你的名字是小C。
```

<details>
<summary>📦 Installation Options</summary>

```bash
# Development mode (with hot reload)
npm run dev

# Production build
npm run build
node dist/cli.js

# Global install
npm link
smart-assistant --help
```

</details>

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
| `EMBEDDING_MODEL` | Embedding model | `doubao-embedding-vision` |
| `SMART_ASSISTANT_DATA_DIR` | Local data directory | `.smart-assistant` |
| `SMART_ASSISTANT_KNOWLEDGE_DIR` | Knowledge source directory | `.smart-assistant/knowledge-sources` |

<details>
<summary>📝 Example .env</summary>

```bash
# LLM Provider
SMART_ASSISTANT_PROVIDER=openai
SMART_ASSISTANT_MODEL=doubao-seed-2.0-lite

# API Configuration
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3

# Embedding (uses same API key)
EMBEDDING_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3
EMBEDDING_MODEL=doubao-embedding-vision

# Data directory
SMART_ASSISTANT_DATA_DIR=.smart-assistant
```

</details>

### Knowledge RAG Setup

Put your Markdown or text files in the knowledge source directory:

```bash
# Default location
mkdir -p .smart-assistant/knowledge-sources

# Add your documents
cp ~/notes/*.md .smart-assistant/knowledge-sources/

# Or set a custom directory
export SMART_ASSISTANT_KNOWLEDGE_DIR=/path/to/your/docs
```

Then ask questions about your documents:
```
you> 搜索一下关于API设计的笔记
assistant> [Tool: search_knowledge] done
According to `api-design.md > RESTful原则`，你的笔记中提到...
```

**Semantic Search:** Knowledge RAG uses vector embeddings for semantic search. This means:
- Cross-language matching: "身份认证" can match "authentication"
- Semantic understanding: "性能优化" matches "performance tuning"
- No exact keyword overlap required

Supported file types: `.md`, `.txt`, `.markdown`

---

## 🏗️ Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 22+ / TypeScript |
| Agent Core | `pi-agent-core` + `pi-ai` |
| Vector DB | LanceDB (embedded, no server) |
| Embeddings | Doubao embedding (2048-dim) |
| File Format | Apache Arrow |

### Project Structure

```
smart-assistant/
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── assistant/          # Agent controller
│   ├── memory/             # Long-term memory (LanceDB)
│   ├── knowledge/          # RAG file search
│   ├── planning/           # Task planning tools
│   ├── session/            # Session persistence
│   └── tools/              # Tool implementations
├── .smart-assistant/       # Local data (gitignored)
│   ├── sessions/           # Conversation history
│   ├── vectors/            # LanceDB vector store (memory + knowledge)
│   └── plans/              # Task plans
└── .planning/              # Project planning docs
```

---

## 📊 Evaluation

v1.0.0 passes all 10 acceptance criteria:

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

```bash
npm run eval  # Run evaluation suite
```

---

## 🔧 Development

```bash
npm run dev        # Development mode
npm run build      # Production build
npm run typecheck  # Type checking
npm run eval       # Run evaluations
```

---

## ⚠️ Known Limitations

- RAG supports Markdown and text files only (no PDF, docx, web crawling)
- No cloud sync — all data is local-first
- Single-user scope (no multi-tenant support)
- CLI-only interface (Web UI/API planned for v3)
- Vector search requires embedding API calls (consider caching for high-volume queries)

---

## 📄 License

MIT © 2024

---

## 🙏 Acknowledgments

Built with:
- [pi-agent-core](https://github.com/earendil-works/pi-agent-core) - Agent runtime
- [LanceDB](https://lancedb.com/) - Embedded vector database
- [Apache Arrow](https://arrow.apache.org/) - Columnar data format
