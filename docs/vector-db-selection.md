# Smart Assistant 向量数据库选型建议

## 一、项目现状分析

### 1.1 项目特点
- **定位**：本地优先、CLI优先的个人知识助手
- **技术栈**：TypeScript + pi-ai + pi-agent-core
- **数据边界**：本地保存，知识和记忆先只做本地文本/Markdown
- **用户规模**：单用户，不需要多租户
- **数据规模**：个人知识库，预计万级到十万级文档

### 1.2 当前RAG实现
```typescript
// 当前使用关键词检索（substring match + word overlap）
private calculateRelevanceScore(chunk: KnowledgeChunk, queryLower: string): number {
  let score = 0;
  
  // Substring match in text (+10)
  if (textLower.includes(queryLower)) {
    score += 10;
  }
  
  // Word overlap (+1 per word)
  const wordOverlap = queryWords.filter((w) => textWords.includes(w)).length;
  if (wordOverlap > 0) {
    score += wordOverlap;
  }
  
  // Heading match (+5)
  // Tag overlap (+2 per tag)
  // Source path match (+3)
  
  return score;
}
```

**问题：**
- 关键词检索无法理解语义相似性
- "机器学习"和"ML"无法匹配
- "如何优化性能"和"性能优化方法"无法匹配

---

## 二、选型建议

### 2.1 推荐方案：Chroma（首选）

**推荐理由：**

**1. 完美匹配项目特点**
- ✅ **本地优先**：Chroma支持本地持久化，无需云服务
- ✅ **TypeScript友好**：有官方JavaScript/TypeScript SDK
- ✅ **单用户**：不需要多租户、分布式
- ✅ **规模适中**：万级到十万级文档，Chroma完全够用
- ✅ **易集成**：几行代码就能集成到现有项目

**2. 快速验证**
```typescript
// 安装
npm install chromadb

// 使用示例
import { ChromaClient } from "chromadb";

const client = new ChromaClient();
const collection = await client.createCollection({
  name: "knowledge",
  metadata: { description: "Smart Assistant Knowledge Base" }
});

// 添加向量
await collection.add({
  ids: ["chunk1", "chunk2"],
  embeddings: [[0.1, 0.2, ...], [0.3, 0.4, ...]],
  metadatas: [
    { sourcePath: "doc1.md", heading: "Introduction" },
    { sourcePath: "doc2.md", heading: "Architecture" }
  ],
  documents: ["chunk text 1", "chunk text 2"]
});

// 搜索
const results = await collection.query({
  queryEmbeddings: [[0.1, 0.2, ...]],
  nResults: 5
});
```

**3. 迁移成本低**
- 不需要Docker，不需要网络配置
- 可以直接替换现有的`FileKnowledgeStore.search()`方法
- 保持现有的文件存储结构，只升级检索方式

**4. 满足v1需求**
- ✅ RAG-01：配置本地知识目录
- ✅ RAG-02：Markdown/text文件分块
- ✅ RAG-03：向量检索
- ✅ RAG-04：返回source path、snippet、relevance
- ✅ RAG-05：无结果时明确说明
- ✅ RAG-06：排除PDF、docx、web crawling

---

### 2.2 备选方案：FAISS + 本地封装

**适用场景：**
- 追求极致性能
- 不需要网络访问
- 愿意自己封装存储层

**优点：**
- 性能最好（无网络开销）
- 完全本地，无依赖

**缺点：**
- 需要自己实现存储、并发、错误处理
- TypeScript集成需要通过Node.js bindings
- 开发成本高

**示例架构：**
```typescript
class FAISSKnowledgeStore implements KnowledgeStore {
  private index: faiss.IndexFlatIP;  // FAISS索引
  private chunkStore: Map<string, KnowledgeChunk>;  // 本地存储
  
  async search(query: string): Promise<KnowledgeMatch[]> {
    // 1. 生成query向量
    const queryVector = await this.embed(query);
    
    // 2. FAISS检索
    const { distances, indices } = this.index.search(queryVector, 10);
    
    // 3. 从本地存储获取chunk
    const results = indices.map((idx, i) => ({
      chunk: this.chunkStore.get(idx),
      relevanceScore: distances[i]
    }));
    
    return results;
  }
}
```

---

### 2.3 不推荐的方案

#### ❌ Milvus
- **原因**：过度设计
- 项目规模小，不需要分布式
- 部署复杂（需要Docker/K8s）
- 违背"本地优先"原则

#### ❌ Qdrant
- **原因**：虽然性能好，但对于个人项目来说：
- 需要Docker部署
- 增加了运维成本
- Chroma已经够用

#### ❌ Pinecone
- **原因**：违背"本地优先"原则
- 全托管，数据在云端
- 需要网络访问
- 有成本

---

## 三、集成方案

### 3.1 Chroma集成方案

#### Step 1：安装依赖
```bash
npm install chromadb
```

#### Step 2：创建ChromaKnowledgeStore
```typescript
// src/knowledge/chroma-store.ts
import { ChromaClient, Collection } from "chromadb";
import type { KnowledgeChunk, KnowledgeMatch, KnowledgeStore, SearchOptions } from "./types.js";

export class ChromaKnowledgeStore implements KnowledgeStore {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private embeddingFunction: EmbeddingFunction;
  
  constructor(config?: { path?: string }) {
    this.client = new ChromaClient({
      path: config?.path ?? ".smart-assistant/chroma"
    });
    
    // 使用OpenAI或其他embedding模型
    this.embeddingFunction = new OpenAIEmbeddingFunction({
      apiKey: process.env.OPENAI_API_KEY,
      model: "text-embedding-3-small"
    });
  }
  
  async initialize(): Promise<void> {
    this.collection = await this.client.getOrCreateCollection({
      name: "knowledge",
      embeddingFunction: this.embeddingFunction,
      metadata: { description: "Smart Assistant Knowledge Base" }
    });
  }
  
  async ingest(chunks: KnowledgeChunk[]): Promise<void> {
    if (!this.collection) await this.initialize();
    
    await this.collection.add({
      ids: chunks.map(c => c.id),
      documents: chunks.map(c => c.text),
      metadatas: chunks.map(c => ({
        sourcePath: c.sourcePath,
        headingText: c.headingText,
        headingLevel: c.headingLevel,
        tags: c.tags.join(","),
        startLine: c.startLine,
        endLine: c.endLine
      }))
    });
  }
  
  async search(query: string, options?: SearchOptions): Promise<KnowledgeMatch[]> {
    if (!this.collection) await this.initialize();
    
    // 构建where过滤条件
    const where: Record<string, any> = {};
    if (options?.sourcePath) {
      where.sourcePath = { $contains: options.sourcePath };
    }
    if (options?.tags && options.tags.length > 0) {
      where.tags = { $contains: options.tags[0] };
    }
    
    // 向量检索
    const results = await this.collection.query({
      queryTexts: [query],
      nResults: options?.limit ?? 5,
      where: Object.keys(where).length > 0 ? where : undefined
    });
    
    // 转换结果
    return results.ids[0].map((id, i) => ({
      chunk: {
        id,
        text: results.documents[0][i] ?? "",
        sourcePath: results.metadatas[0][i]?.sourcePath ?? "",
        headingText: results.metadatas[0][i]?.headingText ?? "",
        headingLevel: results.metadatas[0][i]?.headingLevel ?? 0,
        tags: (results.metadatas[0][i]?.tags ?? "").split(","),
        startLine: results.metadatas[0][i]?.startLine ?? 0,
        endLine: results.metadatas[0][i]?.endLine ?? 0,
        createdAt: new Date().toISOString()
      },
      relevanceScore: 1 - (results.distances[0][i] ?? 0),  // 转换为相似度
      matchReason: "vector similarity"
    }));
  }
}
```

#### Step 3：修改knowledge/index.ts
```typescript
// src/knowledge/index.ts
import { ChromaKnowledgeStore } from "./chroma-store.js";
import { FileKnowledgeStore } from "./store.js";

export function createKnowledgeStore(useVector: boolean = true): KnowledgeStore {
  if (useVector) {
    return new ChromaKnowledgeStore();
  } else {
    return new FileKnowledgeStore();  // 保留关键词检索作为fallback
  }
}
```

#### Step 4：更新配置
```typescript
// src/config.ts
export interface KnowledgeConfig {
  useVectorSearch: boolean;  // 是否使用向量检索
  embeddingModel: string;    // embedding模型
  chromaPath?: string;       // Chroma数据路径
}

export function resolveKnowledgeConfig(): KnowledgeConfig {
  return {
    useVectorSearch: process.env.USE_VECTOR_SEARCH !== "false",
    embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
    chromaPath: process.env.CHROMA_PATH
  };
}
```

---

### 3.2 Embedding方案选择

#### 方案1：OpenAI Embedding（推荐）
```typescript
import { OpenAIEmbeddingFunction } from "chromadb";

const embeddingFunction = new OpenAIEmbeddingFunction({
  apiKey: process.env.OPENAI_API_KEY,
  model: "text-embedding-3-small"  // 1536维，性价比高
});
```

**优点：**
- 质量好，中文支持好
- 维度适中（1536）
- 成本低（$0.02/1M tokens）

**缺点：**
- 需要API key
- 需要网络访问

---

#### 方案2：本地Embedding模型
```typescript
// 使用transformers.js
import { pipeline } from "@xenova/transformers";

const embedder = await pipeline(
  "feature-extraction",
  "Xenova/multilingual-e5-small"
);

async function embed(text: string): Promise<number[]> {
  const output = await embedder(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}
```

**优点：**
- 完全本地，无网络依赖
- 免费
- 隐私保护好

**缺点：**
- 质量略低于OpenAI
- 需要下载模型（~100MB）
- 首次加载慢

---

#### 方案3：火山引擎（Doubao）Embedding
```typescript
// 如果你已经在用火山引擎的模型
import { DoubaoEmbeddingFunction } from "./doubao-embedding.js";

const embeddingFunction = new DoubaoEmbeddingFunction({
  apiKey: process.env.DOUBAO_API_KEY,
  model: "doubao-embedding"
});
```

**优点：**
- 国内访问快
- 中文效果好
- 与你现有的Doubao模型统一

**缺点：**
- 需要API key
- 需要网络访问

---

## 四、迁移计划

### 4.1 Phase 5：RAG升级（推荐）

**目标：**
- 从关键词检索升级到向量检索
- 保持向后兼容（可切换回关键词检索）

**步骤：**

**Week 1：集成Chroma**
- [ ] 安装chromadb依赖
- [ ] 实现ChromaKnowledgeStore
- [ ] 编写单元测试
- [ ] 验证检索效果

**Week 2：优化和测试**
- [ ] 对比关键词检索和向量检索的效果
- [ ] 调整embedding模型和参数
- [ ] 更新evaluation suite
- [ ] 文档更新

**Week 3：集成到主流程**
- [ ] 修改knowledge/index.ts
- [ ] 更新config
- [ ] 更新.env.example
- [ ] 更新README

---

### 4.2 配置示例

```bash
# .env.example

# Vector Search Configuration
USE_VECTOR_SEARCH=true
EMBEDDING_MODEL=text-embedding-3-small
CHROMA_PATH=.smart-assistant/chroma

# OpenAI API Key (for embedding)
OPENAI_API_KEY=sk-...

# Or use local embedding
# USE_LOCAL_EMBEDDING=true
# EMBEDDING_MODEL=Xenova/multilingual-e5-small
```

---

## 五、效果对比

### 5.1 预期提升

| 场景 | 关键词检索 | 向量检索 | 提升 |
|------|-----------|----------|------|
| 语义相似 | ❌ "机器学习" ≠ "ML" | ✅ 能匹配 | 质的飞跃 |
| 同义表达 | ❌ "优化性能" ≠ "性能提升" | ✅ 能匹配 | 质的飞跃 |
| 长尾查询 | ❌ 需要精确关键词 | ✅ 理解意图 | 大幅提升 |
| 检索速度 | 快（内存） | 中等（向量计算） | 略慢但可接受 |
| 成本 | 无 | OpenAI API成本 | 新增成本 |

### 5.2 评估指标

```typescript
// 添加到evaluation suite
const vectorSearchCases = [
  {
    name: "Semantic similarity",
    query: "如何提升系统性能",
    expectedKeywords: ["优化", "性能", "加速"],
    shouldMatch: ["性能优化方法.md", "系统调优.md"]
  },
  {
    name: "Synonym matching",
    query: "ML算法",
    expectedKeywords: ["机器学习", "算法"],
    shouldMatch: ["机器学习入门.md", "算法介绍.md"]
  },
  {
    name: "Long-tail query",
    query: "我想让程序跑得更快",
    expectedKeywords: ["性能", "优化", "加速"],
    shouldMatch: ["性能优化方法.md"]
  }
];
```

---

## 六、总结

### 推荐方案：Chroma + OpenAI Embedding

**理由：**
1. ✅ 完美匹配"本地优先、CLI优先"的项目定位
2. ✅ TypeScript友好，集成简单
3. ✅ 规模适中，性能足够
4. ✅ 迁移成本低，可快速验证
5. ✅ 满足v1所有RAG需求

**不推荐：**
- ❌ Milvus：过度设计，违背本地优先
- ❌ Qdrant：增加运维成本，Chroma已够用
- ❌ Pinecone：违背本地优先，数据在云端

**下一步：**
1. 安装chromadb：`npm install chromadb`
2. 实现ChromaKnowledgeStore
3. 对比关键词检索和向量检索的效果
4. 更新evaluation suite

---

**面试话术：**
"在我的smart-assistant项目中，我选择Chroma作为向量数据库，因为：
1. 项目是本地优先的个人知识助手，不需要分布式
2. 数据规模是万级到十万级，Chroma完全够用
3. TypeScript友好，几行代码就能集成
4. 可以快速验证向量检索的效果，迁移成本低

如果项目规模扩大到百万级或需要多用户，我会考虑迁移到Qdrant或Milvus。"
