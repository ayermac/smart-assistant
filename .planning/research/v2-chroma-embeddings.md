# Research: Vector Search with LanceDB + Doubao Embedding

**日期:** 2026-05-23
**版本:** v2.0.0
**状态:** 已实现

---

## 背景

v1.0.0 使用关键词匹配实现知识检索，存在问题：
- 需要精确关键词匹配
- 无法理解真正的语义相似性
- 跨语言检索不支持（如 "身份认证" 无法匹配 "authentication"）

v2 用 Embedding 向量搜索替代关键词匹配，实现真正的语义检索。

---

## 技术方案

### Embedding 提供商

| 配置项 | 值 |
|--------|-----|
| Base URL | `https://ark.cn-beijing.volces.com/api/coding/v3` |
| Model | `doubao-embedding-vision` |
| API Key | 与助手共用（`OPENAI_API_KEY`） |
| 维度 | 2048 |

### 向量数据库

| 配置项 | 值 |
|--------|-----|
| 数据库 | LanceDB (embedded) |
| 存储路径 | `.smart-assistant/vectors/` |
| 表名 | `memories`, `knowledge` |
| 后端 | Apache Arrow |

---

## 实现架构

```typescript
// src/memory/store.ts - Memory 向量存储
export class VectorMemoryStore implements MemoryStore {
  private db: LanceDB;
  private table: Table;
  
  async store(text: string, tags?: string[]) {
    const embedding = await this.getEmbedding(text);
    await this.table.add([{
      id: randomUUID(),
      text,
      embedding,
      tags: tags ?? [],
      createdAt: new Date().toISOString()
    }]);
  }
  
  async recall(query: string, limit = 5) {
    const queryEmbedding = await this.getEmbedding(query);
    const results = await this.table
      .vectorSearch("embedding", queryEmbedding)
      .limit(limit)
      .toArray();
    return results;
  }
}

// src/knowledge/vector-store.ts - Knowledge 向量存储
export class VectorKnowledgeStore implements KnowledgeStore {
  // 相同的 LanceDB 数据库，不同的表
  // 共享 embedding 配置
}
```

---

## 已实现需求

### Phase 4: Long-term Memory (Vector)

- [x] LanceDB 集成
- [x] Doubao Embedding API 调用
- [x] `VectorMemoryStore` 类实现
- [x] 语义检索 `recall()` 方法
- [x] 环境变量配置 `EMBEDDING_BASE_URL`, `EMBEDDING_MODEL`

### Phase 8: Knowledge RAG (Vector)

- [x] `VectorKnowledgeStore` 类实现
- [x] 共享 LanceDB 数据库（不同表）
- [x] 知识块向量化存储
- [x] 语义检索知识片段

---

## 依赖安装

```bash
npm install @lancedb/lancedb apache-arrow
```

---

## 配置示例

```env
# .env
OPENAI_API_KEY=your-api-key-here

# Embedding 配置（可选，默认使用下方值）
EMBEDDING_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3
EMBEDDING_MODEL=doubao-embedding-vision
```

---

## 成本分析

| 操作 | API 调用 | 成本 |
|------|----------|------|
| 存储 1 条记忆/知识 | 1 embedding | 低 |
| 搜索 1 次 | 1 embedding | 低 |
| 1000 条记录 | 1000 embeddings | 中等 |

---

## 验收标准

1. ✅ 用户说 "记住你叫小C"，记忆被存储
2. ✅ 用户问 "你是谁"、"你叫什么"、"谁"，都能检索到该记忆
3. ✅ 知识搜索 "身份认证" 匹配 "authentication"（语义匹配）
4. ✅ 返回结果按相似度排序
5. ✅ 无需维护同义词表

---

## 架构优势

### LanceDB vs ChromaDB

| 特性 | LanceDB | ChromaDB |
|------|---------|----------|
| 部署 | Embedded（无需服务） | 需要服务进程 |
| 依赖 | 纯 Node.js | Python 服务 |
| 存储 | Apache Arrow（列式） | SQLite/DuckDB |
| 零配置 | ✅ | ❌ |

### 共享 Embedding

Memory 和 Knowledge 共享：
- 同一个 LanceDB 数据库
- 同一个 embedding 模型配置
- 相同的 2048 维向量

---

*Updated: 2026-05-23*