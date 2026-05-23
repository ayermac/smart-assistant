/**
 * Markdown/text chunker - splits files into chunks for knowledge indexing.
 *
 * Three-layer chunking strategy:
 * 1. Layer 1: Split by Markdown headings (#, ##, ###, etc.)
 * 2. Layer 2: For sections > maxChunkSize, split by paragraph boundaries
 * 3. Layer 3: Add overlap from previous chunk for context continuity
 *
 * Plain text files use paragraph-based chunking.
 */

import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import type { KnowledgeChunk } from "./types.js";

/**
 * Supported file extensions for knowledge ingestion.
 */
export const SUPPORTED_EXTENSIONS = [".md", ".markdown", ".txt"] as const;

/**
 * Options for chunking behavior.
 */
export interface ChunkOptions {
  /** Maximum chunk size in characters (default 800) */
  maxChunkSize?: number;
  /** Overlap size in characters between adjacent chunks (default 80) */
  overlap?: number;
}

/**
 * Check if a file extension is supported.
 */
export function isSupportedExtension(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number]);
}

/**
 * Chunk a file into KnowledgeChunk[] based on file type.
 *
 * - Markdown files (.md, .markdown): three-layer chunking with overlap
 * - Plain text files (.txt): paragraph-based chunking with overlap
 * - Unsupported extensions: empty array
 *
 * @param filePath - Path to the file being chunked
 * @param content - File content to chunk
 * @param options - Chunking options (maxChunkSize, overlap)
 */
export function chunkFile(
  filePath: string,
  content: string,
  options?: ChunkOptions
): KnowledgeChunk[] {
  // Empty content returns empty array
  if (!content || content.trim().length === 0) {
    return [];
  }

  // Check if supported extension
  if (!isSupportedExtension(filePath)) {
    return [];
  }

  const ext = extname(filePath).toLowerCase();
  const now = new Date().toISOString();
  const maxChunkSize = options?.maxChunkSize ?? 800;
  const overlap = options?.overlap ?? 80;

  // Plain text files: paragraph-based chunking
  if (ext === ".txt") {
    return chunkTextByParagraph(filePath, content, now, maxChunkSize, overlap);
  }

  // Markdown files: three-layer chunking
  return chunkMarkdown(filePath, content, now, maxChunkSize, overlap);
}

/**
 * Chunk a Markdown file using three-layer chunking with overlap.
 *
 * Layer 1: Split by heading boundaries
 * Layer 2: Split oversized sections by paragraph boundaries
 * Layer 3: Add overlap from previous chunk
 */
function chunkMarkdown(
  filePath: string,
  content: string,
  createdAt: string,
  maxChunkSize: number,
  overlap: number
): KnowledgeChunk[] {
  const lines = content.split("\n");
  const headingRegex = /^(#{1,6})\s+(.+)$/;

  // Layer 1: Split by headings
  const sections: { headingLevel: number; headingText: string; text: string; startLine: number }[] = [];

  let currentStartLine = 0;
  let currentHeadingLevel = 0;
  let currentHeadingText = "";
  let currentContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = headingRegex.exec(line);

    if (match) {
      // Save previous section
      if (currentContent.length > 0) {
        sections.push({
          headingLevel: currentHeadingLevel,
          headingText: currentHeadingText,
          text: currentContent.join("\n").trim(),
          startLine: currentStartLine + 1,
        });
      }

      currentStartLine = i;
      currentHeadingLevel = match[1].length;
      currentHeadingText = match[2].trim();
      currentContent = [line];
    } else {
      currentContent.push(line);
    }
  }

  // Save final section
  if (currentContent.length > 0) {
    sections.push({
      headingLevel: currentHeadingLevel,
      headingText: currentHeadingText,
      text: currentContent.join("\n").trim(),
      startLine: currentStartLine + 1,
    });
  }

  // Layer 2: Split oversized sections by paragraph boundaries
  const subChunks: { headingLevel: number; headingText: string; text: string }[] = [];

  for (const section of sections) {
    if (section.text.length <= maxChunkSize) {
      subChunks.push({
        headingLevel: section.headingLevel,
        headingText: section.headingText,
        text: section.text,
      });
    } else {
      // Split by paragraph boundaries
      const paragraphs = section.text.split(/\n\n+/);
      let buffer = "";

      for (const paragraph of paragraphs) {
        const candidate = buffer.length > 0 ? buffer + "\n\n" + paragraph : paragraph;

        if (candidate.length > maxChunkSize && buffer.length > 0) {
          // Buffer is full, emit chunk
          subChunks.push({
            headingLevel: section.headingLevel,
            headingText: section.headingText,
            text: buffer.trim(),
          });
          buffer = paragraph;
        } else {
          buffer = candidate;
        }
      }

      // Emit remaining buffer
      if (buffer.trim().length > 0) {
        subChunks.push({
          headingLevel: section.headingLevel,
          headingText: section.headingText,
          text: buffer.trim(),
        });
      }
    }
  }

  // Layer 3: Add overlap and build final chunks
  const chunks: KnowledgeChunk[] = [];
  let previousChunkText = "";

  for (const subChunk of subChunks) {
    let chunkText = subChunk.text;

    // Prepend overlap from previous chunk
    if (overlap > 0 && previousChunkText.length > 0 && chunks.length > 0) {
      const overlapText = previousChunkText.slice(-overlap);
      // Only add overlap if it's not already at the start
      if (!chunkText.startsWith(overlapText)) {
        chunkText = overlapText + chunkText;
      }
    }

    if (chunkText.length > 0) {
      chunks.push({
        id: randomUUID(),
        sourcePath: filePath,
        headingLevel: subChunk.headingLevel,
        headingText: subChunk.headingText,
        text: chunkText,
        startLine: 0,
        endLine: 0,
        tags: [],
        createdAt,
      });

      previousChunkText = subChunk.text;
    }
  }

  return chunks;
}

/**
 * Chunk plain text by paragraph boundaries with overlap.
 *
 * Used for .txt files that have no heading structure.
 */
function chunkTextByParagraph(
  filePath: string,
  content: string,
  createdAt: string,
  maxChunkSize: number,
  overlap: number
): KnowledgeChunk[] {
  const paragraphs = content.split(/\n\n+/);
  const chunks: KnowledgeChunk[] = [];
  let buffer = "";
  let previousChunkText = "";

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (trimmed.length === 0) continue;

    const candidate = buffer.length > 0 ? buffer + "\n\n" + trimmed : trimmed;

    if (candidate.length > maxChunkSize && buffer.length > 0) {
      // Emit current buffer as a chunk
      let chunkText = buffer.trim();

      // Add overlap from previous chunk
      if (overlap > 0 && previousChunkText.length > 0 && chunks.length > 0) {
        const overlapText = previousChunkText.slice(-overlap);
        if (!chunkText.startsWith(overlapText)) {
          chunkText = overlapText + chunkText;
        }
      }

      chunks.push({
        id: randomUUID(),
        sourcePath: filePath,
        headingLevel: 0,
        headingText: "",
        text: chunkText,
        startLine: 0,
        endLine: 0,
        tags: [],
        createdAt,
      });

      previousChunkText = buffer.trim();
      buffer = trimmed;
    } else {
      buffer = candidate;
    }
  }

  // Emit remaining buffer
  if (buffer.trim().length > 0) {
    let chunkText = buffer.trim();

    if (overlap > 0 && previousChunkText.length > 0 && chunks.length > 0) {
      const overlapText = previousChunkText.slice(-overlap);
      if (!chunkText.startsWith(overlapText)) {
        chunkText = overlapText + chunkText;
      }
    }

    chunks.push({
      id: randomUUID(),
      sourcePath: filePath,
      headingLevel: 0,
      headingText: "",
      text: chunkText,
      startLine: 0,
      endLine: 0,
      tags: [],
      createdAt,
    });
  }

  // Handle single very long paragraph - hard break
  if (chunks.length === 0 && content.trim().length > 0) {
    const text = content.trim();
    let offset = 0;
    let previousText = "";

    while (offset < text.length) {
      let end = Math.min(offset + maxChunkSize, text.length);
      let chunkText = text.slice(offset, end);

      // Add overlap from previous chunk
      if (overlap > 0 && previousText.length > 0 && offset > 0) {
        const overlapText = previousText.slice(-overlap);
        if (!chunkText.startsWith(overlapText)) {
          chunkText = overlapText + chunkText;
        }
      }

      chunks.push({
        id: randomUUID(),
        sourcePath: filePath,
        headingLevel: 0,
        headingText: "",
        text: chunkText,
        startLine: 0,
        endLine: 0,
        tags: [],
        createdAt,
      });

      previousText = text.slice(offset, end);
      offset = end;
    }
  }

  return chunks;
}
