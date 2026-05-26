/**
 * Document loader registry.
 *
 * Provides a unified interface for loading documents from various file formats.
 * Registers all available loaders and dispatches to the appropriate one
 * based on file extension.
 */

import { extname } from "node:path";
import type { DocumentLoader, LoadedDocument, LoadResult } from "./types.js";
import { PDFLoader, pdfLoader } from "./pdf.js";
import { DOCXLoader, docxLoader } from "./docx.js";

// Re-export types and loaders
export * from "./types.js";
export { PDFLoader, pdfLoader, DOCXLoader, docxLoader };

/**
 * All registered document loaders.
 */
const loaders: DocumentLoader[] = [
  pdfLoader,
  docxLoader,
];

/**
 * Get the appropriate loader for a file extension.
 *
 * @param extension - File extension including the dot (e.g., ".pdf")
 * @returns The loader that supports this extension, or undefined
 */
export function getLoader(extension: string): DocumentLoader | undefined {
  const ext = extension.toLowerCase();
  return loaders.find((loader) => loader.supports(ext));
}

/**
 * Check if a file extension is supported by any loader.
 *
 * @param extension - File extension including the dot (e.g., ".pdf")
 * @returns true if a loader exists for this extension
 */
export function isLoaderSupported(extension: string): boolean {
  return getLoader(extension) !== undefined;
}

/**
 * Load a document from a file path.
 *
 * Automatically selects the appropriate loader based on file extension.
 *
 * @param filePath - Absolute path to the file
 * @returns Loaded document with text and metadata
 * @throws Error if no loader supports the extension or loading fails
 */
export async function loadDocument(filePath: string): Promise<LoadedDocument> {
  const extension = extname(filePath);
  const loader = getLoader(extension);

  if (!loader) {
    throw new Error(`No loader found for file extension: ${extension}`);
  }

  return loader.load(filePath);
}

/**
 * Load a document with error handling.
 *
 * Returns a LoadResult that includes either the loaded document or an error message.
 *
 * @param filePath - Absolute path to the file
 * @returns LoadResult with document or error
 */
export async function loadDocumentSafe(filePath: string): Promise<LoadResult> {
  try {
    const document = await loadDocument(filePath);
    return { document, filePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message, filePath };
  }
}

/**
 * Get all supported file extensions across all loaders.
 */
export function getSupportedExtensions(): string[] {
  const extensions = new Set<string>();
  for (const loader of loaders) {
    for (const ext of loader.supportedExtensions) {
      extensions.add(ext.toLowerCase());
    }
  }
  return Array.from(extensions).sort();
}