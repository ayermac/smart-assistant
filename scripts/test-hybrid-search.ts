/**
 * 测试混合检索功能
 *
 * 运行: npx tsx scripts/test-hybrid-search.ts
 */

import { VectorKnowledgeStore } from "../src/knowledge/index.js";

async function main() {
  console.log("=== 混合检索测试 ===\n");

  // 创建知识库存储
  const store = new VectorKnowledgeStore({
    dbPath: ".smart-assistant/test-vectors",
    sourceDir: "knowledge-sources",
  });

  // 初始化
  console.log("1. 初始化知识库...");
  await store.init();

  // 索引文档
  console.log("2. 索引文档...");
  const manifest = await store.ingest();
  console.log(`   - 索引了 ${manifest.chunks.length} 个块`);
  console.log(`   - 来源文件: ${manifest.sources.length} 个`);

  // 测试搜索
  console.log("\n3. 测试搜索:\n");

  // 测试 1: 专有名词搜索 (BM25 应该表现好)
  console.log("--- 测试 1: 专有名词搜索 'LLMRouter' ---");
  const results1 = await store.search("LLMRouter", { limit: 3 });
  console.log(`找到 ${results1.length} 个结果:`);
  results1.forEach((r, i) => {
    console.log(`  ${i + 1}. [分数: ${r.relevanceScore.toFixed(4)}] ${r.chunk.headingText || "(无标题)"}`);
    console.log(`     原因: ${r.matchReason}`);
    console.log(`     内容预览: ${r.chunk.text.slice(0, 50)}...`);
  });

  // 测试 2: 中文关键词搜索
  console.log("\n--- 测试 2: 中文关键词搜索 '身份认证' ---");
  const results2 = await store.search("身份认证", { limit: 3 });
  console.log(`找到 ${results2.length} 个结果:`);
  results2.forEach((r, i) => {
    console.log(`  ${i + 1}. [分数: ${r.relevanceScore.toFixed(4)}] ${r.chunk.headingText || "(无标题)"}`);
    console.log(`     原因: ${r.matchReason}`);
    console.log(`     内容预览: ${r.chunk.text.slice(0, 50)}...`);
  });

  // 测试 3: 语义搜索
  console.log("\n--- 测试 3: 语义搜索 '如何提升系统响应速度' ---");
  const results3 = await store.search("如何提升系统响应速度", { limit: 3 });
  console.log(`找到 ${results3.length} 个结果:`);
  results3.forEach((r, i) => {
    console.log(`  ${i + 1}. [分数: ${r.relevanceScore.toFixed(4)}] ${r.chunk.headingText || "(无标题)"}`);
    console.log(`     原因: ${r.matchReason}`);
    console.log(`     内容预览: ${r.chunk.text.slice(0, 50)}...`);
  });

  // 测试 4: 验证 HTML 清洗
  console.log("\n--- 测试 4: 验证 HTML 清洗 ---");
  const allChunks = await store.listChunks();
  const hasHtml = allChunks.some(c =>
    c.id && manifest.chunks.find(ch => ch.id === c.id)?.charCount &&
    (manifest.chunks.find(ch => ch.id === c.id)?.headingText?.includes("<details>") ?? false)
  );
  console.log(`HTML 标签是否被清洗: ${hasHtml ? "❌ 未清洗" : "✓ 已清洗"}`);

  // 测试 5: 验证切块大小
  console.log("\n--- 测试 5: 验证切块大小 ---");
  const chunkSizes = manifest.chunks.map(c => c.charCount);
  const maxChunk = Math.max(...chunkSizes);
  const avgChunk = chunkSizes.reduce((a, b) => a + b, 0) / chunkSizes.length;
  console.log(`最大块大小: ${maxChunk} 字符`);
  console.log(`平均块大小: ${avgChunk.toFixed(0)} 字符`);
  console.log(`块大小限制 (800): ${maxChunk <= 800 ? "✓ 符合" : "❌ 超出"}`);

  console.log("\n=== 测试完成 ===");
}

main().catch(console.error);
