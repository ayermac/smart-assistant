# Phase 09: RAG Pipeline 升级 — 三层切块 + 清洗 + BM25 + RRF + Reranker

> **目标**：将 smart-assistant 的 RAG 检索从"纯向量检索"升级到"生产级混合检索"
> **原则**：最小接口改动，`KnowledgeStore.search()` 签名不变，内部实现增强
> **参考**：personal-work/rag_demo.py 的完整流水线设计

---

## 改造范围总览

```
src/knowledge/
├── types.ts          [不改]    接口不变
├── cleaner.ts        [新增]    文本清洗
├── chunker.ts        [重构]    三层切块 + overlap
├── bm25.ts           [新增]    BM25 关键词检索
├── fusion.ts         [新增]    RRF 融合 + Reranker 可选
├── vector-store.ts   [修改]    搜索流程改为 向量+BM25→RRF→Reranker
└── index.ts          [不改]    导出不变
```

`KnowledgeStore` 接口和 `search_knowledge` 工具**完全不变**，只升级内部实现。

---

## 模块一：`cleaner.ts` — 文本清洗

### 做什么

```
原始文档 → cleanText() → 清洗后文本
```

### 清洗规则

| 操作 | 说明 |
|------|------|
| 去除 HTML 标签 | `<details>` `<summary>` `<br>` 等 |
| 压缩连续空行 | `\n{3,}` → `\n\n` |
| 去除行首行尾空白 | 每行 trim |
| 可选：提取 YAML frontmatter | `---\n...\n---` → 存到 chunk metadata |

### 接口

```typescript
export function cleanText(text: string): string;
export function extractFrontmatter(text: string): { body: string; frontmatter: Record<string, unknown> | null };
```

### 为什么单独一个文件

清洗是可独立测试的纯函数，不依赖 chunker 或 vector store。

---

## 模块二：`chunker.ts` — 三层切块

### 当前问题

只按标题边界切，一个 `###` 下面 3000 字全塞一个 chunk。

### 改造后算法

```
chunkMarkdown(content, { maxChunkSize: 800, overlap: 80 })
  │
  ├── 第一层：按 Markdown 标题切分（保留现有逻辑）
  │    # → 新 section / ## → 新 section / ...
  │
  ├── 第二层：对超过 maxChunkSize 的 section，按段落边界（\n\n）二次切
  │    逐段累加，超过阈值就产出 chunk
  │
  └── 第三层：每个 chunk 末尾保留上一 chunk 的最后 overlap 字符
       作为相邻 chunk 的上下文衔接
```

### 新增配置

```typescript
export interface ChunkOptions {
  maxChunkSize?: number;  // 默认 800 字符
  overlap?: number;        // 默认 80 字符（约 10%）
}
```

### chunkFile 签名变化

```typescript
// 旧
export function chunkFile(filePath: string, content: string): KnowledgeChunk[]

// 新
export function chunkFile(filePath: string, content: string, options?: ChunkOptions): KnowledgeChunk[]
```

### 文本文件改造

当前 `.txt` 整个文件一个 chunk。改造后也走三层切 → 段落边界切 → 超长截断。

---

## 模块三：`bm25.ts` — BM25 关键词检索

### 做什么

给倒排索引做关键词检索，补齐向量检索对专有名词的盲区。

### 接口

```typescript
export class BM25Retriever {
  index(chunks: KnowledgeChunk[]): void;
  search(query: string, topK?: number): BM25Match[];
}

export interface BM25Match {
  chunkId: string;
  text: string;
  score: number;
}
```

### 核心实现

- 分词：中文按字 + 英文按空格，不引入 jieba 依赖
- 倒排索引：term → doc_freq，每个 chunk 存 term_freq
- BM25 公式：`IDF × TF_norm`，`k1=1.5, b=0.75`
- 全内存，性能够用（知识库文件不大）

### 为什么不用 jieba

避免原生依赖增加部署复杂度。中文单字 bigram 的 BM25 在实践中效果不差——对专有名词（"LLMRouter"、"ChromaDB"）等英文词，按空格分词就够了；中文关键词单字匹配也能召回。

---

## 模块四：`fusion.ts` — RRF 融合 + Reranker

### RRF 融合

```
向量检索结果[] + BM25检索结果[]
        │
        ▼
    rrfFusion() → 去重 + 按 RRF 分数排序 → Top-15
```

**公式**：`score(chunk) = Σ 1/(k + rank_i)`，`k=60`

- 向量路 rank 越靠前权重越大
- BM25 路 rank 越靠前权重越大
- 两路都命中的 chunk 得分叠加

### ~~Reranker（暂不实现）~~

Reranker 收益明显，但 smart-assistant 是纯 TypeScript 项目，引入 Cross-Encoder 需要额外服务。后续可考虑：
- 方案 A：Python sidecar 调用 sentence-transformers
- 方案 B：Cohere/Jina Reranker API

**本次升级只做到 RRF 融合**，效果已经比纯向量检索有质的提升。

---

## 模块五：`vector-store.ts` — 搜索流程改造

### 改动点

只改 `search()` 方法，其余方法不变。

### 改造前后对比

**改造前**：
```
search(query)
  → getEmbedding(query)
  → table.vectorSearch(queryVector).limit(N)
  → 返回结果
```

**改造后**：
```
search(query)
  ├── getEmbedding(query)                    // 向量化
  ├── table.vectorSearch(queryVector).limit(20)   // ANN top-20
  ├── bm25.search(query, topK=20)                 // BM25 top-20
  ├── rrfFusion(vectorResults, bm25Results)       // RRF 融合
  └── 返回 top-N（取 options.limit）
```

### BM25 索引生命周期

```
第一次 search() 时：
  → bm25 未初始化
  → 从 LanceDB 读取所有 chunk 文本
  → bm25.index(allChunks)
  → 后续搜索复用

ingest() 重新索引后：
  → bm25 失效，下次 search() 时重建
```

### 需要新增的私有属性

```typescript
private bm25: BM25Retriever | null = null;
private bm25NeedsRebuild: boolean = true;
```

---

## 数据流总览

```
┌─────────────────────────────────────────────────────────────┐
│                    RAG Pipeline v2                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  【索引阶段】                                                  │
│  knowledge-sources/*.md                                     │
│       │                                                      │
│       ▼                                                      │
│  cleanText()  ← 去 HTML / 压缩空行 / trim                   │
│       │                                                      │
│       ▼                                                      │
│  chunkFile()  ← 标题切 → 段落切 → 硬截断 + overlap(80)      │
│       │                                                      │
│       ▼                                                      │
│  getEmbedding() → LanceDB table.add()                       │
│       │                                                      │
│       ▼                                                      │
│  标记 bm25NeedsRebuild = true                               │
│                                                              │
│  【查询阶段】                                                  │
│  search(query)                                              │
│       │                                                      │
│       ├── getEmbedding(query)                               │
│       │       └── table.vectorSearch() → top-20             │
│       │                                                      │
│       ├── bm25.search(query) → top-20                       │
│       │                                                      │
│       ├── rrfFusion() → 融合去重排序 → top-15               │
│       │                                                      │
│       └── 截断至 options.limit → 返回 KnowledgeMatch[]      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/knowledge/cleaner.ts` | **新增** | `cleanText()` + `extractFrontmatter()` |
| `src/knowledge/chunker.ts` | **重构** | 加入三层切块 + overlap + ChunkOptions |
| `src/knowledge/bm25.ts` | **新增** | `BM25Retriever` 类 |
| `src/knowledge/fusion.ts` | **新增** | `rrfFusion()` 函数 |
| `src/knowledge/vector-store.ts` | **修改** | `search()` 改为混合检索流程 |
| `src/knowledge/types.ts` | **不加字段** | KnowledgeChunk 已有所有需要字段 |
| `src/tools/knowledge.ts` | **不改** | 接口不变，自动受益 |

---

## 验收标准

1. `npx tsx scripts/eval.ts` 全部通过
2. 搜索 "LLMRouter 设计" 能命中相关 chunk（验证 BM25 覆盖专有名词）
3. 搜索 "性能优化" 返回的 chunk 不超过 800 字符（验证超长块已拆分）
4. overlap 相邻 chunk 首尾有重叠内容（验证 overlap 生效）
5. HTML 标签不出现在 chunk 文本中（验证清洗生效）
