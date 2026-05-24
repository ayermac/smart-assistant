# Phase 10: Obsidian Multimodal RAG - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning
**Source:** User discussion (2026-05-24)

<domain>
## Phase Boundary

Phase 10 将 smart-assistant 从本地知识库检索升级为完整的 Obsidian vault 集成，支持多模态内容（文本+图片）和实时文件监听。

**核心能力：**
1. 直接指向 Obsidian vault 路径进行索引
2. 解析双向链接 `[[note-name]]` 并建立关联
3. 图片多模态嵌入（使用 doubao-embedding-vision）
4. 文件监听自动增量更新

**不在范围内：**
- 多 vault 支持
- PDF/docx 解析
- 云同步
- Web UI

</domain>

<decisions>
## Implementation Decisions

### D-01: 接入方式
**决策：** 直接指向 Obsidian vault 路径

```env
OBSIDIAN_VAULT_PATH=/Users/xxx/MyObsidianVault
```

**原因：** 实时访问，无需同步步骤，用户体验更流畅。

### D-02: 双向链接处理
**决策：** 解析 `[[note-name]]` 并建立关联，检索时返回关联笔记

**实现：**
- 解析 `[[note-name]]` 提取目标笔记名
- 存储为 `linkedNotes: string[]` 元数据
- 检索时返回匹配笔记及其关联笔记

### D-03: 图片路径解析
**决策：** 配置 vault 根路径解析图片绝对路径

**实现：**
- Markdown 中的 `![](attachments/xxx.png)` 相对路径
- 结合 `OBSIDIAN_VAULT_PATH` 解析为绝对路径
- 读取图片文件并转为 Base64

### D-04: 多模态嵌入
**决策：** 使用 doubao-embedding-vision 多模态嵌入模型

**版本：** 250615 或更新版本（支持文本+图片混排）

**API 调用：**
```typescript
const embedding = await getMultimodalEmbedding({
  text: "图片的上下文描述",
  image: "base64..." 或 "https://..."
}, config);
// 输出：单个 2048 维向量（图文融合）
```

### D-05: 增量更新
**决策：** 使用 chokidar 文件监听 + 增量索引

**实现：**
- 启动时监听 vault 目录
- `add` → 索引新文件
- `change` → 重新索引修改文件
- `unlink` → 移除索引

**启动流程：**
```
smart-assistant 启动
  ↓
检查 OBSIDIAN_VAULT_PATH 配置
  ↓
启动文件监听 (chokidar)
  ↓
对比已索引文件的 mtime
  ↓
增量索引变化的文件
  ↓
进入 CLI 交互模式
```

### D-06: 数据结构扩展
**决策：** 扩展 KnowledgeChunk 类型支持图片和链接

```typescript
interface KnowledgeChunk {
  id: string;
  sourcePath: string;
  text: string;
  vector?: number[];

  // 新增字段
  images?: ImageReference[];
  imageVector?: number[];
  linkedNotes?: string[];
  lastModified?: number; // 用于增量更新
}

interface ImageReference {
  path: string;        // 图片绝对路径
  relativePath: string; // Markdown 中的相对路径
  altText?: string;    // alt 文本
}
```

### D-07: 检索融合
**决策：** 图文混合检索，返回统一结果

**流程：**
```
查询 → 文本嵌入
     → 向量搜索（文本+图片混合）
     → 合并结果
     → 返回文本块 + 图片块 + 关联笔记
```

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 现有架构
- `src/knowledge/index.ts` — Knowledge 模块入口
- `src/knowledge/types.ts` — 现有类型定义
- `src/knowledge/vector-store.ts` — LanceDB 向量存储
- `src/knowledge/chunker.ts` — 三层切块实现
- `src/knowledge/cleaner.ts` — 文本清洗
- `src/knowledge/bm25.ts` — BM25 检索
- `src/knowledge/fusion.ts` — RRF 融合
- `src/memory/embedding.ts` — 现有嵌入客户端

### 外部依赖
- `doubao-embedding-vision` API — 多模态嵌入（支持文本+图片）
- `chokidar` — 文件监听库

</canonical_refs>

<specifics>
## Specific Ideas

### 1. Obsidian 特性支持

| Obsidian 特性 | 处理方式 |
|--------------|---------|
| Markdown 文件 | ✅ 已支持 |
| 本地图片 `![](attachments/xxx.png)` | 🆕 多模态嵌入 |
| Frontmatter (YAML 元数据) | ✅ 已有 `extractFrontmatter()` |
| 标签 `#tag` | 🆕 作为检索元数据 |
| 双向链接 `[[note-name]]` | 🆕 解析并建立关联 |

### 2. 工作量估算

| 任务 | 时间 |
|------|------|
| Obsidian vault 路径配置 | 0.5 天 |
| 双向链接解析 + 关联存储 | 1 天 |
| 图片路径解析 + 多模态嵌入 | 1 天 |
| 文件监听 + 增量索引 | 1.5 天 |
| 测试 | 1 天 |
| **总计** | **5 天** |

### 3. 环境变量新增

```env
# Obsidian vault 路径
OBSIDIAN_VAULT_PATH=/Users/xxx/MyObsidianVault

# 多模态嵌入（复用现有配置）
EMBEDDING_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3
EMBEDDING_MODEL=doubao-embedding-vision
```

</specifics>

<deferred>
## Deferred Ideas

- 多 vault 支持 — 当前只支持单个 vault
- 实时协作 — Obsidian Sync 不在范围内
- 图谱视图 — 可作为 v3 功能
- Canvas 支持 — 需要单独的解析器

</deferred>

---

*Phase: 10-obsidian-multimodal-rag*
*Context gathered: 2026-05-24*
