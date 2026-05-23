/**
 * BM25 keyword retrieval - provides keyword search complementing vector retrieval.
 *
 * Implements BM25 scoring with Chinese character-level + bigram tokenization
 * and English space-separated tokenization. No external dependencies (no jieba).
 */

import type { KnowledgeChunk } from "./types.js";

/**
 * A match result from BM25 search.
 */
export interface BM25Match {
  chunkId: string;
  text: string;
  score: number;
}

/** BM25 parameter k1 - controls term frequency saturation */
const K1 = 1.5;
/** BM25 parameter b - controls document length normalization */
const B = 0.75;

/**
 * Tokenize text into terms for indexing/searching.
 *
 * - Chinese characters: character-by-character + bigrams
 * - English: space-separated tokens (lowercased)
 * - Mixed text: both strategies applied
 */
function tokenize(text: string): string[] {
  const terms: string[] = [];

  // Split into segments of CJK and non-CJK characters
  const segments = text.match(/[一-鿿㐀-䶿]+|[^一-鿿㐀-䶿]+/g) ?? [];

  for (const segment of segments) {
    const isCJK = /[一-鿿㐀-䶿]/.test(segment[0]);

    if (isCJK) {
      // Chinese: character-by-character + bigrams
      const chars = [...segment];
      for (const char of chars) {
        terms.push(char);
      }
      // Add bigrams for better phrase matching
      for (let i = 0; i < chars.length - 1; i++) {
        terms.push(chars[i] + chars[i + 1]);
      }
    } else {
      // English and other: split by whitespace, lowercase
      const words = segment
        .toLowerCase()
        .split(/[\s\W]+/)
        .filter((word) => word.length > 0);
      terms.push(...words);
    }
  }

  return terms;
}

/**
 * Term frequency in a document.
 */
interface TermFreq {
  [term: string]: number;
}

/**
 * Internal representation of an indexed chunk.
 */
interface IndexedChunk {
  chunkId: string;
  text: string;
  termFreqs: TermFreq;
  docLen: number;
}

/**
 * BM25 Retriever - builds an inverted index and performs keyword search.
 *
 * Usage:
 * ```typescript
 * const retriever = new BM25Retriever();
 * retriever.index(chunks);
 * const results = retriever.search("query text", 10);
 * ```
 */
export class BM25Retriever {
  private chunks: IndexedChunk[] = [];
  private docFreq: Map<string, number> = new Map();
  private avgDocLen = 0;
  private isIndexed = false;

  /**
   * Build the inverted index from knowledge chunks.
   *
   * @param chunks - Knowledge chunks to index
   */
  index(chunks: KnowledgeChunk[]): void {
    this.chunks = [];
    this.docFreq = new Map();
    let totalLen = 0;

    for (const chunk of chunks) {
      const terms = tokenize(chunk.text);
      const termFreqs: TermFreq = {};

      for (const term of terms) {
        termFreqs[term] = (termFreqs[term] ?? 0) + 1;
      }

      const indexed: IndexedChunk = {
        chunkId: chunk.id,
        text: chunk.text,
        termFreqs,
        docLen: terms.length,
      };

      this.chunks.push(indexed);
      totalLen += terms.length;

      // Update document frequency
      const seenTerms = new Set(Object.keys(termFreqs));
      for (const term of seenTerms) {
        this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1);
      }
    }

    this.avgDocLen = this.chunks.length > 0 ? totalLen / this.chunks.length : 0;
    this.isIndexed = true;
  }

  /**
   * Search for chunks matching the query using BM25 scoring.
   *
   * @param query - Search query text
   * @param topK - Maximum number of results to return (default 10)
   * @returns Array of BM25 matches sorted by score (descending)
   */
  search(query: string, topK = 10): BM25Match[] {
    if (!this.isIndexed || this.chunks.length === 0) {
      return [];
    }

    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) {
      return [];
    }

    const N = this.chunks.length;
    const scores: { chunkId: string; text: string; score: number }[] = [];

    for (const chunk of this.chunks) {
      let score = 0;

      for (const term of queryTerms) {
        const tf = chunk.termFreqs[term] ?? 0;
        if (tf === 0) continue;

        const n = this.docFreq.get(term) ?? 0;

        // IDF: log((N - n + 0.5) / (n + 0.5) + 1)
        const idf = Math.log((N - n + 0.5) / (n + 0.5) + 1);

        // TF normalization: ((k1 + 1) * tf) / (k1 * (1 - b + b * docLen / avgDocLen) + tf)
        const tfNorm =
          ((K1 + 1) * tf) /
          (K1 * (1 - B + B * chunk.docLen / this.avgDocLen) + tf);

        score += idf * tfNorm;
      }

      if (score > 0) {
        scores.push({
          chunkId: chunk.chunkId,
          text: chunk.text,
          score,
        });
      }
    }

    // Sort by score descending and take topK
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }
}
