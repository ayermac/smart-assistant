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
import { parseWikiLinks, parseImages, parseTags } from "./obsidian.js";
import { isLoaderSupported, getSupportedExtensions, loadDocument, type LoadedDocument } from "./loaders/index.js";

/**
 * Supported file extensions for knowledge ingestion.
 * Includes text formats (md, txt) and binary formats (pdf, docx) via loaders.
 */
export const SUPPORTED_EXTENSIONS = [".md", ".markdown", ".txt", ".pdf", ".docx"] as const;

/**
 * Options for chunking behavior.
 */
export interface ChunkOptions {
  /** Maximum chunk size in characters (default 800) */
  maxChunkSize?: number;
  /** Overlap size in characters between adjacent chunks (default 80) */
  overlap?: number;
  /** Obsidian vault path for parsing wiki links and images */
  vaultPath?: string;
  /** Absolute path to the source file being chunked (for relative image path resolution) */
  sourceFilePath?: string;
}

/**
 * Check if a file extension is supported.
 */
export function isSupportedExtension(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number]);
}

/**
 * Check if a file format requires document loading (binary formats).
 */
export function isBinaryFormat(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return [".pdf", ".docx"].includes(ext);
}

/**
 * Load and chunk a binary document (PDF, DOCX).
 *
 * @param filePath - Path to the file
 * @param options - Chunking options
 * @returns Array of KnowledgeChunks
 */
export async function chunkBinaryFile(
  filePath: string,
  options?: ChunkOptions
): Promise<KnowledgeChunk[]> {
  // Load document using appropriate loader
  const doc = await loadDocument(filePath);

  // Chunk the loaded document
  return chunkDocument(filePath, doc, options);
}

/**
 * Chunk a loaded document into KnowledgeChunks.
 *
 * @param filePath - Original file path (for metadata)
 * @param doc - Loaded document with text and metadata
 * @param options - Chunking options
 * @returns Array of KnowledgeChunks
 */
export function chunkDocument(
  filePath: string,
  doc: LoadedDocument,
  options?: ChunkOptions
): KnowledgeChunk[] {
  // Empty content returns empty array
  if (!doc.text || doc.text.trim().length === 0) {
    return [];
  }

  const now = new Date().toISOString();
  const maxChunkSize = options?.maxChunkSize ?? 800;
  const overlap = options?.overlap ?? 80;

  // Use paragraph-based chunking for document text
  return chunkTextByParagraph(filePath, doc.text, now, maxChunkSize, overlap, options?.vaultPath, options?.sourceFilePath);
}

/**
 * Build a KnowledgeChunk with optional Obsidian parsing.
 */
function buildChunk(
  filePath: string,
  headingLevel: number,
  headingText: string,
  text: string,
  createdAt: string,
  vaultPath?: string,
  sourceFilePath?: string
): KnowledgeChunk {
  // Parse Obsidian features if vaultPath is provided
  const linkedNotes = vaultPath ? parseWikiLinks(text) : undefined;
  const images = vaultPath ? parseImages(text, vaultPath, sourceFilePath) : undefined;
  const parsedTags = vaultPath ? parseTags(text) : undefined;

  return {
    id: randomUUID(),
    sourcePath: filePath,
    headingLevel,
    headingText,
    text,
    startLine: 0,
    endLine: 0,
    tags: parsedTags ?? [],
    createdAt,
    // Add Obsidian-specific fields
    ...(linkedNotes && linkedNotes.length > 0 ? { linkedNotes } : {}),
    ...(images && images.length > 0 ? { images } : {}),
  };
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
  const vaultPath = options?.vaultPath;
  const sourceFilePath = options?.sourceFilePath;

  // Plain text files: paragraph-based chunking
  if (ext === ".txt") {
    return chunkTextByParagraph(filePath, content, now, maxChunkSize, overlap, vaultPath, sourceFilePath);
  }

  // Markdown files: three-layer chunking
  return chunkMarkdown(filePath, content, now, maxChunkSize, overlap, vaultPath, sourceFilePath);
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
  overlap: number,
  vaultPath?: string,
  sourceFilePath?: string
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
      chunks.push(buildChunk(
        filePath,
        subChunk.headingLevel,
        subChunk.headingText,
        chunkText,
        createdAt,
        vaultPath,
        sourceFilePath
      ));
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
  overlap: number,
  vaultPath?: string,
  sourceFilePath?: string
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

      chunks.push(buildChunk(
        filePath,
        0,
        "",
        chunkText,
        createdAt,
        vaultPath,
        sourceFilePath
      ));

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

    chunks.push(buildChunk(
      filePath,
      0,
      "",
      chunkText,
      createdAt,
      vaultPath,
      sourceFilePath
    ));
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

      chunks.push(buildChunk(
        filePath,
        0,
        "",
        chunkText,
        createdAt,
        vaultPath,
        sourceFilePath
      ));

      previousText = text.slice(offset, end);
      offset = end;
    }
  }

  return chunks;
}
