/**
 * Tests for document loaders (PDF, DOCX).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { PDFLoader, pdfLoader } from "../loaders/pdf.js";
import { DOCXLoader, docxLoader } from "../loaders/docx.js";
import { getLoader, isLoaderSupported, loadDocument, getSupportedExtensions } from "../loaders/index.js";
import { chunkBinaryFile, isBinaryFormat, SUPPORTED_EXTENSIONS } from "../chunker.js";

// Test fixtures directory
const FIXTURES_DIR = join(import.meta.dirname, "fixtures");

describe("Document Loaders", () => {
  beforeAll(async () => {
    // Create fixtures directory
    await mkdir(FIXTURES_DIR, { recursive: true });
  });

  afterAll(async () => {
    // Clean up fixtures
    await rm(FIXTURES_DIR, { recursive: true, force: true });
  });

  describe("PDFLoader", () => {
    it("should support .pdf extension", () => {
      expect(pdfLoader.supports(".pdf")).toBe(true);
      expect(pdfLoader.supports(".PDF")).toBe(true);
      expect(pdfLoader.supports(".txt")).toBe(false);
    });

    it("should list supported extensions", () => {
      expect(pdfLoader.supportedExtensions).toContain(".pdf");
    });

    it("should throw error for non-existent file", async () => {
      await expect(pdfLoader.load("/non/existent/file.pdf")).rejects.toThrow();
    });
  });

  describe("DOCXLoader", () => {
    it("should support .docx extension", () => {
      expect(docxLoader.supports(".docx")).toBe(true);
      expect(docxLoader.supports(".DOCX")).toBe(true);
      expect(docxLoader.supports(".txt")).toBe(false);
    });

    it("should list supported extensions", () => {
      expect(docxLoader.supportedExtensions).toContain(".docx");
    });

    it("should throw error for non-existent file", async () => {
      await expect(docxLoader.load("/non/existent/file.docx")).rejects.toThrow();
    });
  });

  describe("Loader Registry", () => {
    it("should get correct loader for extension", () => {
      const pdfLoaderInstance = getLoader(".pdf");
      expect(pdfLoaderInstance).toBeDefined();
      expect(pdfLoaderInstance?.supportedExtensions).toContain(".pdf");

      const docxLoaderInstance = getLoader(".docx");
      expect(docxLoaderInstance).toBeDefined();
      expect(docxLoaderInstance?.supportedExtensions).toContain(".docx");
    });

    it("should return undefined for unsupported extension", () => {
      const loader = getLoader(".xyz");
      expect(loader).toBeUndefined();
    });

    it("should check if extension is supported", () => {
      expect(isLoaderSupported(".pdf")).toBe(true);
      expect(isLoaderSupported(".docx")).toBe(true);
      expect(isLoaderSupported(".md")).toBe(false);
      expect(isLoaderSupported(".txt")).toBe(false);
    });

    it("should get all supported extensions", () => {
      const extensions = getSupportedExtensions();
      expect(extensions).toContain(".pdf");
      expect(extensions).toContain(".docx");
      expect(extensions.sort()).toEqual(extensions); // Should be sorted
    });
  });
});

describe("Chunker Binary Support", () => {
  it("should detect binary formats", () => {
    expect(isBinaryFormat("document.pdf")).toBe(true);
    expect(isBinaryFormat("document.docx")).toBe(true);
    expect(isBinaryFormat("document.md")).toBe(false);
    expect(isBinaryFormat("document.txt")).toBe(false);
  });

  it("should include PDF and DOCX in supported extensions", () => {
    expect(SUPPORTED_EXTENSIONS).toContain(".pdf");
    expect(SUPPORTED_EXTENSIONS).toContain(".docx");
  });
});