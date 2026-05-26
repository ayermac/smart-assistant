/**
 * Document loader types for knowledge ingestion.
 *
 * Defines interfaces for loading documents from various file formats
 * (PDF, DOCX, etc.) and converting them to a unified format for chunking.
 */

/**
 * Metadata for a loaded document.
 */
export interface DocumentMetadata {
  /** Original file path that was loaded */
  sourcePath: string;
  /** Number of pages (for PDFs and similar paginated documents) */
  pageCount?: number;
  /** Approximate word count */
  wordCount?: number;
  /** Document title if extractable */
  title?: string;
  /** Author if extractable */
  author?: string;
  /** Creation date if extractable */
  createdAt?: string;
  /** Last modified date if extractable */
  modifiedAt?: string;
}

/**
 * A document loaded from a file, ready for chunking.
 */
export interface LoadedDocument {
  /** Extracted text content */
  text: string;
  /** Document metadata */
  metadata: DocumentMetadata;
}

/**
 * Interface for document loaders.
 *
 * Each loader handles a specific file format and extracts text content
 * for knowledge indexing.
 */
export interface DocumentLoader {
  /**
   * Load a document from the given file path.
   *
   * @param filePath - Absolute path to the file
   * @returns Loaded document with text and metadata
   * @throws Error if the file cannot be loaded or parsed
   */
  load(filePath: string): Promise<LoadedDocument>;

  /**
   * Check if this loader supports the given file extension.
   *
   * @param extension - File extension including the dot (e.g., ".pdf")
   * @returns true if this loader can handle the extension
   */
  supports(extension: string): boolean;

  /**
   * List of supported file extensions.
   */
  readonly supportedExtensions: readonly string[];
}

/**
 * Result of a document loading operation.
 */
export interface LoadResult {
  /** Successfully loaded document, if any */
  document?: LoadedDocument;
  /** Error message if loading failed */
  error?: string;
  /** File path that was attempted */
  filePath: string;
}
