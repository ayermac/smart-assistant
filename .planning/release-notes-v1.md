# Smart Assistant v1.0.0 Release Notes

**Release Date:** 2026-05-22

## Overview

Smart Assistant v1.0.0 is the first stable release of a local-first, CLI-first personal knowledge assistant.

## Features

### Core Capabilities

| Feature | Description |
|---------|-------------|
| **Chat** | Interactive CLI conversation with streaming responses |
| **Memory** | Explicit long-term memory storage and recall |
| **RAG** | Local Markdown/text knowledge search with source citation |
| **Planning** | Structured task decomposition and status tracking |
| **Session** | Persistent conversation history with restore |

### Memory (Phase 4)
- `remember` tool stores facts and preferences with optional tags
- `recall_memory` retrieves relevant memories by query
- JSON file storage with UUID identifiers
- Keyword and tag matching for retrieval

### RAG (Phase 5)
- `search_knowledge` searches local Markdown/text files
- Source path citation in responses
- Empty result handling (no hallucination)
- Markdown heading-based chunking

### Planning (Phase 6)
- `create_plan` decomposes goals into structured steps
- `update_plan` tracks step status (pending/in_progress/completed)
- Single plan mode with JSON persistence
- System prompt guides when to use planning

### Session (Phase 3)
- Automatic session persistence
- Session restore by ID or latest
- Conversation history continuation

## Evaluation Results

| Metric | Result |
|--------|--------|
| Total Cases | 10 |
| Passed | 10 |
| Failed | 0 |
| Pass Rate | **100%** |
| Release Threshold | 80% (8/10) |

### Test Coverage

| Category | Cases | Status |
|----------|-------|--------|
| Chat | 1 | ✅ All pass |
| Memory | 2 | ✅ All pass |
| RAG | 2 | ✅ All pass |
| Planning | 2 | ✅ All pass |
| Error Handling | 1 | ✅ All pass |
| Long Context | 1 | ✅ All pass |
| Session | 1 | ✅ All pass |

## Known Limitations

- RAG supports only Markdown and text files (PDF, docx excluded)
- No cloud sync - all data is local-first
- Single-user scope (no multi-tenant support)
- CLI-only interface (Web UI/API planned for v2)
- No embedding-based semantic search (keyword matching only)

## Installation

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

## Quick Start

```bash
# Start interactive session
npm run start

# Run evaluation
npm run eval
```

## Data Storage

All data stored in `.smart-assistant/`:
- `sessions/` - Conversation history
- `memory/` - Long-term memories
- `knowledge/` - RAG index
- `plans/` - Task plans

## Tech Stack

- TypeScript
- `pi-ai` - Model/provider abstraction
- `pi-agent-core` - Agent loop and tool calling
- Node.js CLI

## What's Next (v2)

- Web UI/API interfaces
- PDF/docx support for RAG
- Cloud sync options
- Multi-agent collaboration
- Embedding-based semantic search

---

*Smart Assistant v1.0.0 - Local-first personal knowledge assistant*
