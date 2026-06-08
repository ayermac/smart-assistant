/**
 * 建立知识库索引
 *
 * 运行: npx tsx scripts/index-knowledge.ts
 *
 * 需要 OPENAI_API_KEY 或 ANTHROPIC_API_KEY 环境变量
 */

import { VectorKnowledgeStore } from "../src/knowledge/index.js";
import { resolveDataPaths, resolveKnowledgeSourceDir } from "../src/config.js";
import { config } from "dotenv";

// 加载 .env 文件
config();

async function main() {
  console.log("=== 建立知识库索引 ===\n");

  // 检查 API Key (支持 OPENAI_API_KEY 或 ANTHROPIC_API_KEY)
  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("错误: 缺少 API Key 环境变量");
    console.log("\n请在 .env 文件中配置:");
    console.log("  OPENAI_API_KEY=your-api-key  (推荐，用于 Doubao/OpenAI)");
    console.log("  或");
    console.log("  ANTHROPIC_API_KEY=your-api-key");
    process.exit(1);
  }

  const dataPaths = resolveDataPaths();
  const sourceDir = resolveKnowledgeSourceDir();

  // 创建知识库存储
  const store = new VectorKnowledgeStore({
    dbPath: dataPaths.vectors,
    sourceDir,
  });

  console.log("知识源目录:", sourceDir);
  console.log("向量数据库:", dataPaths.vectors, "\n");

  // 初始化
  console.log("1. 初始化...");
  await store.init();

  // 建立索引
  console.log("2. 建立索引（这可能需要几分钟）...\n");
  const manifest = await store.ingest();

  // 输出结果
  console.log("\n=== 索引完成 ===\n");
  console.log(`文件数量: ${manifest.sources.length}`);
  console.log(`块数量: ${manifest.chunks.length}`);
  console.log(`索引时间: ${manifest.lastIndexed}`);

  if (manifest.sources.length > 0) {
    console.log("\n已索引文件:");
    manifest.sources.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.path} (${s.chunkCount} 个块)`);
    });
  }

  // 统计
  const avgChunkSize = manifest.chunks.reduce((sum, c) => sum + c.charCount, 0) / (manifest.chunks.length || 1);
  console.log(`\n平均块大小: ${avgChunkSize.toFixed(0)} 字符`);

  console.log("\n现在可以使用 search_knowledge 工具进行搜索了！");
}

main().catch((err) => {
  console.error("\n索引失败:", err.message);
  process.exit(1);
});
