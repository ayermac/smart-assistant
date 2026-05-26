# Summary: Add LangChain Document Loaders (11-02)

## Goal

Add support for PDF and DOCX document formats using LangChain's document loaders, enabling indexing and retrieval of content from these common file types.

## Implementation

### 1. Dependencies Installed

Added to `package.json`:
- `@langchain/community` - LangChain document loaders
- `@langchain/core` - Core interfaces
- `pdf-parse` - PDF text extraction
- `mammoth` - DOCX to text conversion
- `vitest` - Test framework (dev dependency)

### 2. Loader Module Created (`src/knowledge/loaders/`)

**types.ts** - Core interfaces:
- `DocumentMetadata` - Source path, page count, word count, title, author, dates
- `LoadedDocument` - Text content + metadata
- `DocumentLoader` - Interface with `load()`, `supports()`, `supportedExtensions`
- `LoadResult` - Result wrapper with error handling

**pdf.ts** - PDF loader:
- Uses `pdf-parse` library with `PDFParse` class
- Extracts text content via `getText()`
- Extracts metadata via `getInfo()`
- Handles dates via `getDateNode()`
- Properly destroys parser resources after use

**docx.ts** - DOCX loader:
- Uses `mammoth` library
- Extracts raw text via `extractRawText()`
- Logs warnings for conversion issues

**index.ts** - Loader registry:
- `getLoader(extension)` - Get loader for extension
- `isLoaderSupported(extension)` - Check support
- `loadDocument(filePath)` - Unified loading interface
- `loadDocumentSafe(filePath)` - Error-safe loading
- `getSupportedExtensions()` - List all supported extensions

### 3. Chunker Updated (`src/knowledge/chunker.ts`)

- Added `.pdf`, `.docx` to `SUPPORTED_EXTENSIONS`
- Added `isBinaryFormat()` helper
- Added `chunkBinaryFile()` - Load and chunk binary documents
- Added `chunkDocument()` - Chunk loaded document content

### 4. Vector Store Updated (`src/knowledge/vector-store.ts`)

Modified `indexFile()` to:
- Detect binary formats via `isBinaryFormat()`
- Use `chunkBinaryFile()` for PDF/DOCX files
- Maintain existing text file handling for md/txt

### 5. Tests Added (`src/knowledge/__tests__/loaders.test.ts`)

- PDF loader extension support tests
- DOCX loader extension support tests
- Loader registry function tests
- Chunker binary format detection tests

## Commits

1. `09724af` - feat: add LangChain document loader dependencies
2. `095fb37` - feat: add document loaders for PDF and DOCX formats
3. `bec3bca` - feat: add binary document support to chunker
4. `9a9b600` - feat: integrate document loaders in vector-store
5. `52e4b4d` - test: add tests for document loaders

## Files Modified

- `package.json` - Added dependencies
- `pnpm-lock.yaml` - Lock file update
- `src/knowledge/loaders/types.ts` - New file
- `src/knowledge/loaders/pdf.ts` - New file
- `src/knowledge/loaders/docx.ts` - New file
- `src/knowledge/loaders/index.ts` - New file
- `src/knowledge/chunker.ts` - Added binary format support
- `src/knowledge/vector-store.ts` - Integrated document loaders
- `src/knowledge/__tests__/loaders.test.ts` - New test file

## Verification

- [x] TypeScript compiles without errors
- [x] All 12 tests pass
- [x] PDF extension supported (`.pdf`)
- [x] DOCX extension supported (`.docx`)
- [x] Existing Markdown/text indexing unchanged (backward compatible)

## Usage

To index a PDF or DOCX file:

```typescript
const store = new VectorKnowledgeStore();
await store.init();
await store.indexFile("/path/to/document.pdf");
await store.indexFile("/path/to/document.docx");

// Search works across all formats
const results = await store.search("query text");
```

## Limitations

- PDF parsing may lose complex formatting (tables, images embedded in PDF)
- DOCX parsing preserves text structure but not styling
- Image embedding (multimodal) only works for Markdown files with image references, not images embedded in PDF/DOCX

## Next Steps

Phase 11-03 will add LangChain Rerank for improved retrieval relevance.
