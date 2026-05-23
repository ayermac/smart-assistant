/**
 * 单元测试 - 测试 BM25、文本清洗、切块功能
 *
 * 运行: npx tsx scripts/test-modules.ts
 */

import { cleanText, extractFrontmatter, BM25Retriever, chunkFile } from "../src/knowledge/index.js";

console.log("=== RAG 管道模块测试 ===\n");

// ===== 测试 1: 文本清洗 =====
console.log("--- 测试 1: 文本清洗 ---");

const htmlInput = `<details>
<summary>点击展开</summary>
这是详细内容。
</details>

正文内容在这里。


还有更多内容。`;

const cleaned = cleanText(htmlInput);
console.log("输入:", htmlInput.slice(0, 50) + "...");
console.log("清洗后:", cleaned);
console.log("HTML 标签已移除:", !cleaned.includes("<details>") ? "✓" : "❌");
console.log("空行已压缩:", !cleaned.includes("\n\n\n") ? "✓" : "❌");

// ===== 测试 2: 前言提取 =====
console.log("\n--- 测试 2: 前言提取 ---");

const frontmatterInput = `---
title: 测试文档
date: 2026-05-23
tags: [test, demo]
---

这是正文内容。`;

const { body, frontmatter } = extractFrontmatter(frontmatterInput);
console.log("前言:", frontmatter);
console.log("正文:", body);
console.log("前言解析正确:", frontmatter?.title === "测试文档" ? "✓" : "❌");

// ===== 测试 3: 三层切块 =====
console.log("\n--- 测试 3: 三层切块 ---");

const markdownContent = `# 主标题

这是第一段内容，包含一些文字。

## 子标题 A

这是子标题 A 下的内容。内容比较长，需要测试切块功能是否正常工作。

## 子标题 B

${"很长的一段文字。".repeat(100)}`;

const chunks = chunkFile("test.md", markdownContent, { maxChunkSize: 800, overlap: 80 });
console.log(`切块数量: ${chunks.length}`);
console.log(`最大块大小: ${Math.max(...chunks.map(c => c.text.length))} 字符`);
console.log(`块大小限制 (800): ${chunks.every(c => c.text.length <= 800) ? "✓" : "❌"}`);

// 检查重叠
let overlapFound = false;
for (let i = 1; i < chunks.length; i++) {
  const prevEnd = chunks[i - 1].text.slice(-80);
  const currStart = chunks[i].text.slice(0, 80);
  if (prevEnd && currStart.includes(prevEnd.slice(0, 20))) {
    overlapFound = true;
    break;
  }
}
console.log(`重叠检测: ${overlapFound || chunks.length === 1 ? "✓" : "❌"}`);

// ===== 测试 4: BM25 检索 =====
console.log("\n--- 测试 4: BM25 检索 ---");

const bm25 = new BM25Retriever();
bm25.index(chunks);

// 测试中文搜索
const chineseResults = bm25.search("子标题", 3);
console.log(`中文搜索 "子标题": 找到 ${chineseResults.length} 个结果`);
chineseResults.forEach((r, i) => {
  console.log(`  ${i + 1}. [分数: ${r.score.toFixed(4)}] ${r.text.slice(0, 30)}...`);
});

// 测试英文搜索
const englishResults = bm25.search("content", 3);
console.log(`\n英文搜索 "content": 找到 ${englishResults.length} 个结果`);
englishResults.forEach((r, i) => {
  console.log(`  ${i + 1}. [分数: ${r.score.toFixed(4)}] ${r.text.slice(0, 30)}...`);
});

// ===== 测试 5: .txt 文件切块 =====
console.log("\n--- 测试 5: .txt 文件切块 ---");

const txtContent = `第一段内容。

第二段内容，包含更多文字。

第三段内容，${"很长的文字。".repeat(50)}`;

const txtChunks = chunkFile("test.txt", txtContent, { maxChunkSize: 800, overlap: 80 });
console.log(`.txt 切块数量: ${txtChunks.length}`);
console.log(`按段落切块: ${txtChunks.length > 1 ? "✓" : "❌"}`);

console.log("\n=== 所有测试完成 ===");
