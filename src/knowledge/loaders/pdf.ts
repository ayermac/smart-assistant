/**
 * PDF document loader using pdf-parse.
 *
 * Extracts text content from PDF files for knowledge indexing.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { PDFParse } from "pdf-parse";
import type { DocumentLoader, LoadedDocument, DocumentMetadata } from "./types.js";

/**
 * PDF loader implementation using pdf-parse library.
 */
export class PDFLoader implements DocumentLoader {
  readonly supportedExtensions = [".pdf"] as const;

  supports(extension: string): boolean {
    const ext = extension.toLowerCase();
    return this.supportedExtensions.includes(ext as (typeof this.supportedExtensions)[number]);
  }

  async load(filePath: string): Promise<LoadedDocument> {
    // Read the PDF file as buffer
    const buffer = await readFile(filePath);

    // Create parser with the PDF data
    const parser = new PDFParse({ data: buffer });

    // Extract text content
    let textResult;
    let infoResult;
    try {
      [textResult, infoResult] = await Promise.all([
        parser.getText(),
        parser.getInfo(),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse PDF ${filePath}: ${message}`);
    } finally {
      // Clean up parser resources
      await parser.destroy();
    }

    // Extract text content
    const text = textResult.text || "";

    // Build metadata
    const metadata: DocumentMetadata = {
      sourcePath: filePath,
      pageCount: textResult.total,
      wordCount: this.countWords(text),
      title: infoResult.info?.Title || basename(filePath, ".pdf"),
      author: infoResult.info?.Author,
    };

    // Add dates if available
    const dateNode = infoResult.getDateNode();
    if (dateNode.CreationDate) {
      metadata.createdAt = dateNode.CreationDate.toISOString();
    }
    if (dateNode.ModDate) {
      metadata.modifiedAt = dateNode.ModDate.toISOString();
    }

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
export const pdfLoader = new PDFLoader();
