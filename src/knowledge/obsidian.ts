/**
 * Obsidian parser - parses Obsidian-specific Markdown features.
 *
 * Handles:
 * - Wiki links: [[note-name]] and [[note-name|display text]]
 * - Image references: ![alt](path)
 * - Tags: #tag and frontmatter tags
 * - Note path resolution
 */

import { join, dirname } from "node:path";
import { stat } from "node:fs/promises";
import type { ImageReference } from "./types.js";

/**
 * Parse wiki links from content.
 *
 * Supports formats:
 * - [[note-name]] - simple link
 * - [[note-name|display text]] - link with alias
 *
 * @param content - Markdown content
 * @returns Array of unique note names (without .md extension)
 */
export function parseWikiLinks(content: string): string[] {
  if (!content) return [];

  const noteNames = new Set<string>();

  // Match [[note-name]] or [[note-name|display text]]
  // Note: The note name can contain spaces, Chinese characters, and most punctuation
  const wikiLinkRegex = /\[\[([^\]|#]+)(?:\|[^\]]+)?(?:#[^\]]+)?\]\]/g;

  let match;
  while ((match = wikiLinkRegex.exec(content)) !== null) {
    const noteName = match[1].trim();
    if (noteName) {
      noteNames.add(noteName);
    }
  }

  return Array.from(noteNames);
}

/**
 * Parse image references from content.
 *
 * Supports Markdown image syntax:
 * - ![alt text](path/to/image.png)
 * - ![](attachments/image.jpg)
 *
 * Path resolution:
 * - Absolute paths (/path/to/image.png) - used as-is
 * - Relative to note (./image.png, ../image.png) - resolved relative to source file's directory
 * - Other relative paths (image.png, attachments/image.png) - resolved relative to vault root
 *
 * @param content - Markdown content
 * @param vaultPath - Obsidian vault root path
 * @param sourceFilePath - Optional path to the source Markdown file for relative path resolution
 * @returns Array of ImageReference objects
 */
export function parseImages(content: string, vaultPath: string, sourceFilePath?: string): ImageReference[] {
  if (!content || !vaultPath) return [];

  const images: ImageReference[] = [];
  const sourceDir = sourceFilePath ? dirname(sourceFilePath) : null;

  // Match ![alt](path) - standard Markdown image
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

  let match;
  while ((match = imageRegex.exec(content)) !== null) {
    const altText = match[1] || undefined;
    const relativePath = match[2].trim();

    // Skip external URLs
    if (relativePath.startsWith("http://") || relativePath.startsWith("https://")) {
      continue;
    }

    // Resolve absolute path with proper precedence:
    // 1. Already absolute path - use as-is
    // 2. Relative to note (./ or ../) - resolve relative to source file's directory
    // 3. Other relative paths - resolve relative to vault root (Obsidian convention)
    let absolutePath: string;

    if (relativePath.startsWith("/")) {
      // Already absolute
      absolutePath = relativePath;
    } else if (relativePath.startsWith("./") || relativePath.startsWith("../")) {
      // Explicitly relative to note's directory
      if (sourceDir) {
        absolutePath = join(sourceDir, relativePath);
      } else {
        // Fallback to vault root if no source file path
        absolutePath = join(vaultPath, relativePath);
      }
    } else {
      // Obsidian convention: relative paths are relative to vault root
      // This handles cases like "attachments/image.png" or "Pasted image.png"
      absolutePath = join(vaultPath, relativePath);
    }

    images.push({
      path: absolutePath,
      relativePath,
      altText,
    });
  }

  return images;
}

/**
 * Parse Obsidian tags from content.
 *
 * Supports:
 * - Inline tags: #tag, #nested/tag
 * - Frontmatter tags: tags: [tag1, tag2]
 *
 * @param content - Markdown content
 * @returns Array of unique tags (without # prefix)
 */
export function parseTags(content: string): string[] {
  if (!content) return [];

  const tags = new Set<string>();

  // Parse frontmatter tags first
  const frontmatterTags = parseFrontmatterTags(content);
  for (const tag of frontmatterTags) {
    tags.add(tag);
  }

  // Parse inline tags: #tag
  // Must not be inside code blocks or inline code
  const lines = content.split("\n");
  let inCodeBlock = false;

  for (const line of lines) {
    // Track code block boundaries
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    // Skip lines inside code blocks
    if (inCodeBlock) continue;

    // Skip inline code segments by replacing them with placeholders
    const lineWithoutCode = line.replace(/`[^`]+`/g, "  ");

    // Match #tag patterns
    // Tag can contain letters, numbers, Chinese characters, underscores, hyphens, and slashes
    const tagRegex = /#([\w一-鿿\-\/]+)/g;
    let match;
    while ((match = tagRegex.exec(lineWithoutCode)) !== null) {
      const tag = match[1];
      // Skip if it looks like a hex color (e.g., #ff0000)
      if (/^[0-9a-fA-F]{6}$/.test(tag)) continue;
      tags.add(tag);
    }
  }

  return Array.from(tags);
}

/**
 * Parse tags from YAML frontmatter.
 *
 * Supports:
 * - tags: tag1
 * - tags: [tag1, tag2]
 * - tags:
 *     - tag1
 *     - tag2
 *
 * @param content - Markdown content
 * @returns Array of tags
 */
function parseFrontmatterTags(content: string): string[] {
  if (!content || !content.startsWith("---\n")) return [];

  const closeIndex = content.indexOf("\n---\n", 4);
  if (closeIndex === -1) return [];

  const frontmatter = content.slice(4, closeIndex);
  const tags: string[] = [];

  // Match "tags: value" or "tags: [values]"
  const tagsMatch = frontmatter.match(/^tags:\s*(.+)$/m);
  if (tagsMatch) {
    const value = tagsMatch[1].trim();

    // Array format: [tag1, tag2]
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1);
      const parsed = inner
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      tags.push(...parsed);
    }
    // Single value
    else if (value) {
      tags.push(value);
    }
  }

  // Match multiline array format
  // tags:
  //   - tag1
  //   - tag2
  const multilineMatch = frontmatter.match(/^tags:\s*$/m);
  if (multilineMatch) {
    const afterTags = frontmatter.slice(multilineMatch.index! + multilineMatch[0].length);
    const lines = afterTags.split("\n");

    for (const line of lines) {
      // Match "  - tag" pattern
      const itemMatch = line.match(/^\s+-\s+(.+)$/);
      if (itemMatch) {
        tags.push(itemMatch[1].trim());
      } else if (line.trim().length > 0 && !line.match(/^\s/)) {
        // End of list when we hit a non-indented line
        break;
      }
    }
  }

  return tags;
}

/**
 * Resolve a note name to its file path.
 *
 * Tries in order:
 * 1. ${vaultPath}/${noteName}.md
 * 2. ${vaultPath}/${noteName}.markdown
 *
 * @param noteName - Note name (without extension)
 * @param vaultPath - Obsidian vault root path
 * @returns Absolute path to the note file, or null if not found
 */
export async function resolveNotePath(
  noteName: string,
  vaultPath: string
): Promise<string | null> {
  if (!noteName || !vaultPath) return null;

  // Try .md extension
  const mdPath = join(vaultPath, `${noteName}.md`);
  try {
    const s = await stat(mdPath);
    if (s.isFile()) return mdPath;
  } catch {
    // File not found, try next
  }

  // Try .markdown extension
  const markdownPath = join(vaultPath, `${noteName}.markdown`);
  try {
    const s = await stat(markdownPath);
    if (s.isFile()) return markdownPath;
  } catch {
    // File not found
  }

  // Note: Obsidian also supports subfolder paths like [[folder/note]]
  // Try treating the noteName as a path relative to vault
  if (noteName.includes("/")) {
    const fullPath = join(vaultPath, noteName);
    for (const ext of [".md", ".markdown", ""]) {
      const tryPath = ext ? `${fullPath}${ext}` : fullPath;
      try {
        const s = await stat(tryPath);
        if (s.isFile()) return tryPath;
      } catch {
        // Continue trying
      }
    }
  }

  return null;
}

/**
 * Synchronous version of resolveNotePath for cases where async is not needed.
 *
 * Note: This version only checks path existence without actual file validation.
 * Use resolveNotePath for production code.
 *
 * @param noteName - Note name (without extension)
 * @param vaultPath - Obsidian vault root path
 * @returns Potential note path (may not exist)
 */
export function getNotePathSync(noteName: string, vaultPath: string): string {
  return join(vaultPath, `${noteName}.md`);
}
