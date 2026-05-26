/**
 * DOCX document loader using mammoth.
 *
 * Extracts text content from Word documents for knowledge indexing.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { DocumentLoader, LoadedDocument, DocumentMetadata } from "./types.js";

/**
 * DOCX loader implementation using mammoth library.
 */
export class DOCXLoader implements DocumentLoader {
  readonly supportedExtensions = [".docx"] as const;

  supports(extension: string): boolean {
    const ext = extension.toLowerCase();
    return this.supportedExtensions.includes(ext as (typeof this.supportedExtensions)[number]);
  }

  async load(filePath: string): Promise<LoadedDocument> {
    // Read the DOCX file as buffer
    const buffer = await readFile(filePath);

    // Dynamically import mammoth
    const mammoth = await import("mammoth");

    // Extract text from DOCX
    let result: { value: string; messages: Array<{ type: string; message: string }> };
    try {
      result = await mammoth.extractRawText({ buffer });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse DOCX ${filePath}: ${message}`);
    }

    // Log any warnings from mammoth
    for (const msg of result.messages) {
      if (msg.type === "warning") {
        console.warn(`[DOCXLoader] ${filePath}: ${msg.message}`);
      }
    }

    // Extract text content
    const text = result.value || "";

    // Build metadata
    const metadata: DocumentMetadata = {
      sourcePath: filePath,
      wordCount: this.countWords(text),
      title: basename(filePath, ".docx"),
    };

    return {
      text,
      metadata,
    };
  }

  /**
   * Count words in text.
   */
  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }
}

/**
 * Singleton instance for convenience.
 */
export const docxLoader = new DOCXLoader();