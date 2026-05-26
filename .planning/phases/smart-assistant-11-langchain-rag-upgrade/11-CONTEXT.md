# Phase 11: LangChain RAG Upgrade

## Context Summary

Phase 11 采用混合方案优化 RAG 系统：修复现有问题 + 选择性引入 LangChain 组件。

## Problem Statement

当前 RAG 实现存在以下问题：

1. **图片检索失效**：imageVector 字段始终为 null，图片内容无法被检索
2. **文档格式受限**：仅支持 Markdown/文本，不支持 PDF、docx 等常见格式
3. **检索质量瓶颈**：缺乏重排序机制，多文档检索时相关性下降

## Decision: Hybrid Approach

**保留现有优势：**
- Vector + BM25 + RRF 融合检索（已验证有效）
- Three-layer chunking with overlap
- LanceDB 本地向量存储
- Doubao embedding（文本 + 多模态）

**引入 LangChain 组件：**
- `@langchain/community` 文档加载器：PDF、docx、pptx
- LangChain Rerank：提升检索相关性排序
- 可选：MultiQueryRetriever 扩展查询

## Scope

### In Scope
1. 修复 imageVector 存储问题（优先级最高）
2. 添加 PDF/docx 文档加载支持
3. 集成 LangChain Rerank 优化排序
4. 保持向后兼容，现有功能不受影响

### Out of Scope
- Web 检索（v3 规划）
- 云端同步（v3 规划）
- 多智能体协作（v3 规划）
- 全量迁移到 LangChain（保持现有架构）

## Technical Context

### Current Architecture

```
User Query
    ↓
VectorKnowledgeStore.search()
    ├── Vector Search (LanceDB)
    ├── BM25 Search (lexical)
    └── RRF Fusion → ranked results
```

### Target Architecture

```
User Query
    ↓
[Optional] MultiQueryRetriever (LangChain)
    ↓
VectorKnowledgeStore.search()
    ├── Vector Search (LanceDB)
    ├── BM25 Search (lexical)
    └── RRF Fusion → candidate results
    ↓
[NEW] LangChain Rerank → final results
```

### Key Files

- `src/knowledge/vector-store.ts` - 核心向量存储
- `src/knowledge/index.ts` - 知识库入口
- `src/knowledge/cleaner.ts` - 文本清洗
- `src/knowledge/chunker.ts` - 文档分块

## Dependencies

### New Packages
- `@langchain/community` - 文档加载器
- `@langchain/core` - 核心接口
- `pdf-parse` 或 `pdfjs-dist` - PDF 解析
- `mammoth` - docx 解析

### Existing Packages (Reuse)
- `vectordb` (LanceDB)
- Doubao embedding API

## Success Criteria

1. **图片检索修复**：搜索能返回包含相关图片的文档块
2. **PDF 支持**：能索引和检索 PDF 文档内容
3. **docx 支持**：能索引和检索 Word 文档内容
4. **Rerank 集成**：检索结果相关性提升（手动测试验证）
5. **向后兼容**：现有 Markdown/文本检索不受影响
6. **测试覆盖**：新增功能有对应测试用例

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| LangChain 包体积大 | 中 | 按需导入，tree-shaking |
| Rerank API 调用成本 | 中 | 仅对 top-k 结果重排序 |
| PDF 解析复杂格式丢失 | 低 | 使用成熟库，记录限制 |
| 多模态 embedding 稳定性 | 高 | 增加重试和降级逻辑 |

## Notes

- Phase 11 是优化阶段，不改变核心架构
- 图片检索修复是 blocking issue，必须优先解决
- LangChain 组件作为可选增强，不强制依赖
