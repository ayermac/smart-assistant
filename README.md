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
| 📄 **Multi-format Support** | Markdown, text, PDF, DOCX document parsing |
| 🔗 **Obsidian Integration** | Real-time sync, wiki-links parsing, image embedding |
| 🎯 **Smart Reranking** | Optional Rerank for improved relevance (Cohere API) |
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

# Optional: Rerank for improved retrieval
RERANK_ENABLED=false
RERANK_PROVIDER=cohere
COHERE_API_KEY=your-cohere-api-key
```

### 3. Run

Plain readline CLI:

```bash
npm run dev
```

Ink terminal UI:

```bash
npm run tui
```

The TUI accepts keyboard input as soon as the prompt is visible. During startup vault sync or runtime initialization, `/exit` and Ctrl+C still exit the process; non-command prompts submitted before the assistant is ready show `Assistant is still initializing.`

After building, the package exposes both binaries:

```bash
npm run build
node dist/cli.js --help
node dist/tui.js --help
```

### 4. Try It

```
you> 记住我的名字是小C
assistant> 好的，我已经记住啦，你的名字是小C。

you> 我叫什么名字
assistant> 根据我存储的记忆，你的名字是小C。
```

---

## 🚢 Production Usage

For day-to-day use, build once and run the compiled entry points instead of `npm run` scripts:

```bash
npm install
npm run build
node dist/cli.js
node dist/tui.js
```

To expose stable shell commands on your machine, install the built checkout once:

```bash
npm install
npm run build
npm install -g .
```

Then run the assistant without `npm`:

```bash
smart-assistant
smart-assistant-tui
```

Use explicit local paths for persistent data and your Obsidian vault:

```bash
export SMART_ASSISTANT_DATA_DIR="$HOME/.smart-assistant"
export OBSIDIAN_VAULT_PATH="$HOME/Obsidian/SecondBrain"
smart-assistant-tui
```

Production notes:
- `npm run dev` and `npm run tui` are development shortcuts.
- `smart-assistant` starts the plain readline CLI.
- `smart-assistant-tui` starts the Ink terminal UI.
- Rebuild with `npm run build` after pulling code changes; reinstall only if the global command link is missing or points elsewhere.

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
| `EMBEDDING_TIMEOUT_MS` | Embedding API request timeout | `30000` |
| `SMART_ASSISTANT_DATA_DIR` | Local data directory | `.smart-assistant` |
| `SMART_ASSISTANT_KNOWLEDGE_DIR` | Knowledge source directory | `.smart-assistant/knowledge-sources` |
| `SMART_ASSISTANT_KNOWLEDGE_TIMEOUT_MS` | `search_knowledge` step timeout | `45000` |
| `SMART_ASSISTANT_LOG_LEVEL` | Local diagnostic log level: `silent`, `error`, `warn`, `info`, `debug` | `info` |
| `OBSIDIAN_VAULT_PATH` | Obsidian vault path (optional) | *not set* |
| `RERANK_ENABLED` | Enable Rerank re-ranking | `false` |
| `RERANK_PROVIDER` | Rerank provider (`cohere` or `noop`) | `cohere` |
| `COHERE_API_KEY` | Cohere API key (required for Rerank) | *not set* |

---

## 📚 Knowledge RAG

### Setup

Put your documents in the knowledge directory:

```bash
mkdir -p knowledge-sources
cp ~/notes/*.md knowledge-sources/
cp ~/documents/*.pdf knowledge-sources/
cp ~/reports/*.docx knowledge-sources/
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

### Hybrid Retrieval (v2.3)

Knowledge RAG uses **hybrid retrieval** with **multimodal support** and **multi-format** documents:

| Method | Strength | Example |
|--------|----------|---------|
| **Vector Search** | Semantic understanding | "身份认证" → "authentication" |
| **BM25** | Exact keyword matching | "LLMRouter" → exact matches |
| **RRF Fusion** | Combines both methods | Chunks in both lists rank higher |
| **Multimodal Embedding** | Text + Image fusion | Query matches images in notes |
| **Rerank** | Semantic re-ranking | Uses Cohere API to improve Top-K relevance |

**Search Pipeline:**
```
query → vector search + BM25 → RRF fusion → [Rerank] → top N results
```

**Multimodal Support:**
- Images in Markdown (`![](image.png)`) are embedded using `doubao-embedding-vision`
- Text + Image fusion enables searching by image content
- Requires `OBSIDIAN_VAULT_PATH` or images in knowledge directory

### Supported File Formats

| Format | Extensions | Parser |
|--------|------------|--------|
| Markdown | `.md`, `.markdown` | Built-in parser |
| Text | `.txt` | Built-in parser |
| PDF | `.pdf` | Built-in loader (pdf-parse) |
| Word | `.docx` | Built-in loader (mammoth) |
| Images | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` | Multimodal embedding |

### Text Processing

- **HTML Cleaning**: Removes `<details>`, `<summary>`, `<br>` tags
- **Three-Layer Chunking**: Heading → Paragraph → Hard break
- **Overlap**: 80-char overlap between adjacent chunks for context continuity
- **Max Chunk Size**: 800 characters (configurable)

### Rerank Configuration

Enable Rerank to improve retrieval relevance:

```bash
# In .env
RERANK_ENABLED=true
RERANK_PROVIDER=cohere
COHERE_API_KEY=your-cohere-api-key
```

**How it works:**
1. Hybrid retrieval returns candidate results (e.g., Top 20)
2. Rerank model computes precise relevance scores for each candidate
3. Results are re-ordered by relevance, returning Top N

**Benefits:**
- Improves retrieval precision for long queries
- Better matches semantically similar but keyword-different content
- Requires additional API call (Cohere Rerank API)

### Diagnostics

For slow or stuck `search_knowledge` calls, enable debug logs and capture stderr:

```bash
SMART_ASSISTANT_LOG_LEVEL=debug smart-assistant-tui 2> smart-assistant.log
```

The log includes per-stage timings for `needsReindex`, query embedding, vector search, BM25 rebuild/search, RRF fusion, rerank, and write waits. During normal usage, leave `SMART_ASSISTANT_LOG_LEVEL` unset or set it to `info`; high-volume vault file indexing logs are only emitted at `debug`.

If a query appears stuck:

1. Check the TUI tool progress line (`Checking knowledge index`, `Indexing knowledge base`, `Searching knowledge base`).
2. Review debug timings in `smart-assistant.log` to identify the slow stage.
3. If the slow stage is indexing, rerun the app after indexing completes; startup sync is incremental after mtime metadata is repaired.
4. If the slow stage is embedding or rerank, verify the provider API key, base URL, and network access.

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

Startup sync is incremental. When upgrading from an older local LanceDB table, the first run may reindex existing vault files once to backfill reliable millisecond modification metadata. Later starts should report the vault is already up to date unless files changed.

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
6. Query your vault in CLI or TUI

To verify incremental startup behavior, run `npm run tui` or `npm run dev` twice without editing the vault. The first run after an upgrade can show `Reindexing` while metadata is repaired; the second unchanged run should show `Vault already up to date`.

If the TUI is still initializing while vault sync runs, the prompt remains interactive. Use `/exit` or Ctrl+C to leave without waiting for initialization to finish.

---

## 🏗️ Architecture

### Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 22+ / TypeScript |
| Agent Core | `pi-agent-core` + `pi-ai` |
| Vector DB | LanceDB (embedded, no server) |
| Embeddings | Doubao embedding (2048-dim) |
| Document Parsing | Built-in loaders with pdf-parse and mammoth |
| Re-ranking | Cohere Rerank API |
| Storage | Apache Arrow |

### Project Structure

```
smart-assistant/
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── tui.tsx             # Ink terminal UI entry point
│   ├── runtime.ts          # Shared CLI/TUI runtime helpers
│   ├── assistant/          # Agent controller
│   ├── memory/             # Long-term memory (LanceDB)
│   ├── knowledge/          # Knowledge RAG (LanceDB)
│   │   ├── loaders/        # Document loaders (PDF, DOCX)
│   │   ├── rerank/         # Re-ranking module
│   │   └── obsidian.ts     # Obsidian parser
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
└── knowledge table         # Knowledge chunk vectors (with imageVector)
```

### Knowledge Chunk Schema

```typescript
interface KnowledgeChunk {
  id: string;              // Unique identifier
  text: string;            // Text content
  vector: number[];        // Text embedding vector (2048-dim)
  imageVector?: number[];  // Image embedding vector (2048-dim, optional)
  sourcePath: string;      // Source file path
  heading?: string;        // Parent heading
  tags: string[];          // Tags
  linkedNotes?: string[];  // Linked notes (Obsidian)
  createdAt: Date;         // Creation timestamp
}
```

---

## 📊 Evaluation

v2.3 passes all acceptance criteria:

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
npm run tui        # Ink terminal UI
npm run build      # Production build
npm run typecheck  # Type checking
npm run typecheck:scripts # Type check scripts/
npm run verify     # Typecheck source + scripts, run tests, then build
npm run eval       # Run evaluations
npm test           # Run tests
```

---

## ⚠️ Limitations

- PDF/DOCX documents require installing dependencies (`pdf-parse`, `mammoth`)
- Images require `doubao-embedding-vision` or compatible multimodal embedding model
- No cloud sync — all data is local-first
- Single-user scope (no multi-tenant support)
- Terminal-only interfaces: readline CLI and Ink TUI. Web UI is planned for v3.

---

## 📝 Changelog

### Unreleased (2026-06-09)

**New Features:**
- Added Ink terminal UI with `smart-assistant-tui` binary.
- Added shared CLI/TUI runtime setup for sessions, data paths, and vault sync.
- Added structured diagnostic logging with `SMART_ASSISTANT_LOG_LEVEL`.
- Added `npm run typecheck:scripts` and `npm run verify`.
- Added offline RAG integration coverage for index + search metadata.

**Fixes:**
- Fixed `npm install` dependency resolution by aligning `apache-arrow` with LanceDB and removing unused LangChain dependencies.
- Stabilized Obsidian startup sync with reliable millisecond mtime metadata.
- Repaired incompatible legacy knowledge table schemas that could trigger LanceDB `Panic in async function`.
- Fixed TUI input and exit behavior during initialization; `/exit` and Ctrl+C work while vault sync is still running.
- Fixed installed npm binary execution when package-manager bin links are symlinks.
- Added abort propagation, progress updates, and timeouts for `search_knowledge` so slow embedding/search calls do not leave the TUI indefinitely responding.
- Added a knowledge-store read/write gate so startup sync and watcher writes do not mutate the table during active searches.
- Improved TUI transcript formatting with fixed prefixes, wrapped assistant output, cleaner citations, and indented list continuations.

**Docs:**
- Documented production usage through compiled `dist` entry points and installed CLI binaries.
- Documented TUI startup input behavior and incremental Obsidian sync verification.
- Documented slow `search_knowledge` diagnostics and full verification workflow.

### v2.3 (2026-05-26)

**New Features:**
- 📄 PDF document support (via pdf-parse)
- 📄 DOCX document support (via mammoth)
- 🎯 Optional Rerank re-ranking (Cohere API)
- 🖼️ Fixed image embedding retrieval bug

**Improvements:**
- Optimized hybrid retrieval pipeline with Rerank post-processing
- Extended file format support table
- Updated knowledge chunk schema with `imageVector` field

### v2.2 (2026-05-23)

- Hybrid retrieval: vector + BM25 + RRF fusion
- Obsidian integration: real-time sync, wiki-links, image embedding
- Three-layer chunking strategy: heading → paragraph → hard break

### v2.0 (2026-05-22)

- Vector search (LanceDB + Doubao embeddings)
- Long-term memory tools
- Knowledge RAG tools
- Task planning tools

---

## 📄 License

MIT © 2024

---

## 🙏 Acknowledgments

- [pi-agent-core](https://github.com/earendil-works/pi-agent-core) - Agent runtime
- [LanceDB](https://lancedb.com/) - Embedded vector database
- [Apache Arrow](https://arrow.apache.org/) - Columnar data format
- [Cohere](https://cohere.com/) - Rerank API
