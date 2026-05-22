# PRD: v2 Chroma + Doubao Embedding 集成

**日期:** 2026-05-22
**版本:** v2.0.0
**依赖:** v1.0.0 (已完成)

---

## 背景

v1.0.0 使用硬编码同义词组实现记忆检索，存在问题：
- 需要手动维护同义词表
- 无法理解真正的语义相似性
- 匹配精度受限

v2 将用 Embedding 向量搜索替代同义词匹配，实现真正的语义检索。

---

## 技术方案

### Embedding 提供商

| 配置项 | 值 |
|--------|-----|
| Base URL | `https://ark.cn-beijing.volces.com/api/coding/v3` |
| Model | `doubao-embedding-vision` |
| API Key | 与助手共用（`ANTHROPIC_API_KEY`） |

### 向量数据库

| 配置项 | 值 |
|--------|-----|
| 数据库 | ChromaDB |
| 存储路径 | `.smart-assistant/chroma/` |
| Collection | `memories` |

---

## 实现架构

```typescript
// src/memory/vector-store.ts

interface EmbeddingConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export class VectorMemoryStore implements MemoryStore {
  private chromaClient: ChromaClient;
  private collection: Collection;
  private embeddingConfig: EmbeddingConfig;

  constructor(config: EmbeddingConfig) {
    this.embeddingConfig = config;
  }

  async init() {
    // 1. 初始化 Chroma
    this.chromaClient = new ChromaClient({ path: ".smart-assistant/chroma" });
    
    // 2. 创建 collection（不使用内置 embedding）
    this.collection = await this.chromaClient.createCollection({
      name: "memories",
      metadata: { description: "Long-term memory storage" }
    });
  }

  async store(text: string, tags?: string[]) {
    // 1. 调用 Doubao API 获取 embedding
    const embedding = await this.getEmbedding(text);
    
    // 2. 存储到 Chroma
    await this.collection.add({
      ids: [randomUUID()],
      embeddings: [embedding],
      documents: [text],
      metadatas: [{ tags: tags ?? [], createdAt: new Date().toISOString() }]
    });
  }

  async recall(query: string, limit = 5) {
    // 1. 获取查询 embedding
    const queryEmbedding = await this.getEmbedding(query);
    
    // 2. 向量搜索
    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit
    });
    
    return results.documents[0].map((doc, i) => ({
      text: doc,
      distance: results.distances[0][i],
      metadata: results.metadatas[0][i]
    }));
  }

  private async getEmbedding(text: string): Promise<number[]> {
    // 调用 Doubao Embedding API
    const response = await fetch(`${this.embeddingConfig.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.embeddingConfig.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.embeddingConfig.model,
        input: text
      })
    });
    
    const data = await response.json();
    return data.data[0].embedding;
  }
}
```

---

## 需求清单

### RAG2-01: Embedding 集成
- [ ] 实现 Doubao Embedding API 调用
- [ ] 支持 baseUrl、model、apiKey 配置
- [ ] API Key 从环境变量读取（与助手共用）

### RAG2-02: Chroma 向量存储
- [ ] 安装 `chromadb` npm 包
- [ ] 创建 `VectorMemoryStore` 类
- [ ] 替换 v1 的 `FileMemoryStore`

### RAG2-03: 向量检索
- [ ] 实现 `recall()` 向量搜索
- [ ] 返回相关度分数（distance）
- [ ] 支持 limit 参数

### RAG2-04: 配置管理
- [ ] 添加环境变量：`EMBEDDING_BASE_URL`, `EMBEDDING_MODEL`
- [ ] API Key 使用现有 `ANTHROPIC_API_KEY`
- [ ] 更新 `.env.example`

### RAG2-05: 向量维度验证
- [ ] 确认 Doubao embedding 维度
- [ ] Chroma collection 配置正确维度

---

## 依赖安装

```bash
npm install chromadb
```

---

## 配置示例

```env
# .env
ANTHROPIC_API_KEY=your-api-key-here

# Embedding 配置（可选，默认使用下方值）
EMBEDDING_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3
EMBEDDING_MODEL=doubao-embedding-vision
```

---

## 迁移路径

### Phase 8: Embedding 集成

1. 创建 `src/memory/vector-store.ts`
2. 实现 `getEmbedding()` 函数
3. 实现 `VectorMemoryStore` 类
4. 更新 `src/assistant/controller.ts` 使用新 store

### Phase 9: 向量迁移

1. 迁移现有 JSON 记忆到 Chroma
2. 创建迁移脚本 `scripts/migrate-memories.ts`
3. 验证向量检索效果

---

## 成本分析

| 操作 | API 调用 | 成本 |
|------|----------|------|
| 存储 1 条记忆 | 1 embedding | 低 |
| 搜索 1 次 | 1 embedding | 低 |
| 1000 条记忆 | 1000 embeddings | 中等 |

**建议：** 
- 存储时生成 embedding
- 搜索时生成 query embedding
- 无重复调用，成本可控

---

## 验收标准

1. ✅ 用户说 "记住你叫小C"，记忆被存储
2. ✅ 用户问 "你是谁"、"你叫什么"、"谁"，都能检索到该记忆
3. ✅ 返回结果包含相关度分数
4. ✅ 无需维护同义词表

---

## 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| API 调用失败 | 无法生成 embedding | 降级到关键词匹配 |
| Chroma 服务挂掉 | 无法检索 | 备份 JSON 文件 |
| Embedding 维度不匹配 | 存储失败 | 验证并固定维度 |

---

## 后续优化（v3）

- 批量 embedding（减少 API 调用）
- Embedding 缓存（避免重复计算）
- 多语言 embedding 模型支持

---

*PRD created: 2026-05-22*
*Author: Claude + User*