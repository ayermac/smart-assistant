import { config } from 'dotenv';
config();

import { VectorKnowledgeStore } from '../src/knowledge/vector-store.js';
import { cleanText, extractFrontmatter } from '../src/knowledge/cleaner.js';
import { chunkFile } from '../src/knowledge/chunker.js';
import { readFile } from 'fs/promises';

async function debug() {
  const store = new VectorKnowledgeStore();
  await store.init();

  // Check if we need to reindex
  const needsReindex = await store.needsReindex();
  console.log('=== Database Status ===');
  console.log('Needs reindex:', needsReindex);
  console.log('');

  if (needsReindex) {
    console.log('Database is empty or needs reindex. Running syncVault...');
    const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
    if (vaultPath) {
      const stats = await store.syncVault(vaultPath);
      console.log('Sync complete:', stats);
    }
    console.log('');
  }

  const results = await store.search('目标公司', { limit: 10 });

  console.log('=== Search Results ===');
  for (const r of results) {
    console.log('---');
    console.log('Source:', r.chunk.sourcePath);
    console.log('Heading:', r.chunk.headingText);
    console.log('Relevance:', r.relevanceScore);
    console.log('Text Length:', r.chunk.text.length);
    console.log('Text Preview:', r.chunk.text.substring(0, 500));
    console.log('');
  }
}

debug().catch(console.error);
