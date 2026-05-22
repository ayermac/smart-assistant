/**
 * Markdown/text chunker - splits files into chunks for knowledge indexing.
 *
 * Markdown files are split at heading boundaries (#, ##, ###).
 * Plain text files are stored as single chunks.
 */

import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import type { KnowledgeChunk } from "./types.js";

/**
 * Supported file extensions for knowledge ingestion.
 */
export const SUPPORTED_EXTENSIONS = [".md", ".markdown", ".txt"] as const;

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
 * - Markdown files (.md, .markdown): split at heading boundaries
 * - Plain text files (.txt): single chunk
 * - Unsupported extensions: empty array
 */
export function chunkFile(
  filePath: string,
  content: string
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

  // Plain text files: single chunk
  if (ext === ".txt") {
    return [
      {
        id: randomUUID(),
        sourcePath: filePath,
        headingLevel: 0,
        headingText: "",
        text: content,
        startLine: 1,
        endLine: content.split("\n").length,
        tags: [],
        createdAt: now,
      },
    ];
  }

  // Markdown files: split at heading boundaries
  return chunkMarkdown(filePath, content, now);
}

/**
 * Chunk a Markdown file at heading boundaries.
 */
function chunkMarkdown(
  filePath: string,
  content: string,
  createdAt: string
): KnowledgeChunk[] {
  const lines = content.split("\n");
  const chunks: KnowledgeChunk[] = [];

  // Regex to detect Markdown headings (#, ##, ###, etc.)
  const headingRegex = /^(#{1,6})\s+(.+)$/;

  let currentChunkStart = 0;
  let currentHeadingLevel = 0;
  let currentHeadingText = "";
  let currentContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = headingRegex.exec(line);

    if (match) {
      // Found a heading - save previous chunk if it has content
      if (currentContent.length > 0) {
        const chunkText = currentContent.join("\n").trim();
        if (chunkText.length > 0) {
          chunks.push({
            id: randomUUID(),
            sourcePath: filePath,
            headingLevel: currentHeadingLevel,
            headingText: currentHeadingText,
            text: chunkText,
            startLine: currentChunkStart + 1,
            endLine: i,
            tags: [],
            createdAt,
          });
        }
      }

      // Start new chunk
      currentChunkStart = i;
      currentHeadingLevel = match[1].length;
      currentHeadingText = match[2].trim();
      currentContent = [line];
    } else {
      // Add line to current chunk
      currentContent.push(line);
    }
  }

  // Save final chunk if it has content
  if (currentContent.length > 0) {
    const chunkText = currentContent.join("\n").trim();
    if (chunkText.length > 0) {
      chunks.push({
        id: randomUUID(),
        sourcePath: filePath,
        headingLevel: currentHeadingLevel,
        headingText: currentHeadingText,
        text: chunkText,
        startLine: currentChunkStart + 1,
        endLine: lines.length,
        tags: [],
        createdAt,
      });
    }
  }

  return chunks;
}
