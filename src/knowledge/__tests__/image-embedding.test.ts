/**
 * Tests for image embedding flow.
 *
 * Tests:
 * 1. parseImages correctly resolves relative paths
 * 2. parseImages handles ./ and ../ paths
 * 3. parseImages handles vault-relative paths
 * 4. imageToBase64 throws on missing file
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { parseImages } from "../obsidian.js";
import { imageToBase64 } from "../multimodal-embedding.js";

describe("parseImages", () => {
  it("should preserve absolute paths", () => {
    const vaultPath = "/Users/test/vault";
    const sourceFilePath = "/Users/test/vault/notes/project/note.md";
    const content = '![alt](/absolute/path/image.png)';

    const images = parseImages(content, vaultPath, sourceFilePath);

    expect(images.length).toBe(1);
    expect(images[0].path).toBe("/absolute/path/image.png");
  });

  it("should resolve ./ paths relative to note directory", () => {
    const vaultPath = "/Users/test/vault";
    const sourceFilePath = "/Users/test/vault/notes/project/note.md";
    const content = '![alt](./image.png)';

    const images = parseImages(content, vaultPath, sourceFilePath);

    expect(images.length).toBe(1);
    expect(images[0].path).toBe(join("/Users/test/vault/notes/project", "./image.png"));
  });

  it("should resolve ../ paths relative to note parent directory", () => {
    const vaultPath = "/Users/test/vault";
    const sourceFilePath = "/Users/test/vault/notes/project/note.md";
    const content = '![alt](../assets/image.png)';

    const images = parseImages(content, vaultPath, sourceFilePath);

    expect(images.length).toBe(1);
    expect(images[0].path).toBe(join("/Users/test/vault/notes/project", "../assets/image.png"));
  });

  it("should resolve vault-relative paths from vault root", () => {
    const vaultPath = "/Users/test/vault";
    const sourceFilePath = "/Users/test/vault/notes/project/note.md";
    const content = '![alt](attachments/image.png)';

    const images = parseImages(content, vaultPath, sourceFilePath);

    expect(images.length).toBe(1);
    expect(images[0].path).toBe(join(vaultPath, "attachments/image.png"));
  });

  it("should skip external URLs", () => {
    const vaultPath = "/Users/test/vault";
    const sourceFilePath = "/Users/test/vault/notes/project/note.md";
    const content = '![alt](https://example.com/image.png)';

    const images = parseImages(content, vaultPath, sourceFilePath);

    expect(images.length).toBe(0);
  });

  it("should resolve to vault root when no sourceFilePath provided", () => {
    const vaultPath = "/Users/test/vault";
    const content = '![alt](image.png)';

    const images = parseImages(content, vaultPath);

    expect(images.length).toBe(1);
    expect(images[0].path).toBe(join(vaultPath, "image.png"));
  });

  it("should parse multiple images and skip external URLs", () => {
    const vaultPath = "/Users/test/vault";
    const sourceFilePath = "/Users/test/vault/notes/note.md";
    const content = `
# Document with images

First image: ![](./image1.png)

Second image: ![alt text](attachments/image2.jpg)

External: ![external](https://example.com/external.png)

Third: ![third](../images/image3.gif)
`;

    const images = parseImages(content, vaultPath, sourceFilePath);

    expect(images.length).toBe(3);
    expect(images[0].path).toContain("notes/image1.png");
    expect(images[1].path).toContain("attachments/image2.jpg");
    expect(images[2].path).toContain("images/image3.gif");
  });
});

describe("imageToBase64", () => {
  it("should throw on empty path", async () => {
    await expect(imageToBase64("")).rejects.toThrow("path is required");
  });

  it("should throw on non-existent file", async () => {
    await expect(imageToBase64("/nonexistent/path/image.png")).rejects.toThrow("not found");
  });

  it("should throw on unsupported extension", async () => {
    await expect(imageToBase64("/some/path/image.txt")).rejects.toThrow("Unsupported");
  });
});
