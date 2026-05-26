/**
 * Tests for image embedding flow.
 *
 * Tests:
 * 1. parseImages correctly resolves relative paths
 * 2. parseImages handles ./ and ../ paths
 * 3. parseImages handles vault-relative paths
 * 4. imageToBase64 throws on missing file
 */

import { strict as assert } from "node:assert";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseImages } from "../obsidian.js";
import { imageToBase64 } from "../multimodal-embedding.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Test parseImages path resolution.
 */
function testParseImagesPaths(): void {
  const vaultPath = "/Users/test/vault";
  const sourceFilePath = "/Users/test/vault/notes/project/note.md";

  // Test 1: Absolute path - used as-is
  const absoluteContent = '![alt](/absolute/path/image.png)';
  const absoluteImages = parseImages(absoluteContent, vaultPath, sourceFilePath);
  assert.equal(absoluteImages.length, 1, "Should parse absolute path");
  assert.equal(absoluteImages[0].path, "/absolute/path/image.png", "Absolute path should be preserved");

  // Test 2: Relative to note (./) - resolved relative to source file's directory
  const relativeNoteContent = '![alt](./image.png)';
  const relativeNoteImages = parseImages(relativeNoteContent, vaultPath, sourceFilePath);
  assert.equal(relativeNoteImages.length, 1, "Should parse relative path");
  assert.equal(
    relativeNoteImages[0].path,
    join("/Users/test/vault/notes/project", "./image.png"),
    "Relative path should be resolved from note's directory"
  );

  // Test 3: Parent directory (../) - resolved relative to source file's parent
  const parentDirContent = '![alt](../assets/image.png)';
  const parentDirImages = parseImages(parentDirContent, vaultPath, sourceFilePath);
  assert.equal(parentDirImages.length, 1, "Should parse parent relative path");
  assert.equal(
    parentDirImages[0].path,
    join("/Users/test/vault/notes/project", "../assets/image.png"),
    "Parent relative path should be resolved correctly"
  );

  // Test 4: Vault-relative path (no ./ or ../) - resolved relative to vault root
  const vaultRelativeContent = '![alt](attachments/image.png)';
  const vaultRelativeImages = parseImages(vaultRelativeContent, vaultPath, sourceFilePath);
  assert.equal(vaultRelativeImages.length, 1, "Should parse vault-relative path");
  assert.equal(
    vaultRelativeImages[0].path,
    join(vaultPath, "attachments/image.png"),
    "Vault-relative path should be resolved from vault root"
  );

  // Test 5: External URL - skipped
  const urlContent = '![alt](https://example.com/image.png)';
  const urlImages = parseImages(urlContent, vaultPath, sourceFilePath);
  assert.equal(urlImages.length, 0, "External URLs should be skipped");

  // Test 6: No sourceFilePath - all relative paths resolved to vault root
  const noSourceContent = '![alt](image.png)';
  const noSourceImages = parseImages(noSourceContent, vaultPath);
  assert.equal(noSourceImages.length, 1, "Should parse path without source file");
  assert.equal(
    noSourceImages[0].path,
    join(vaultPath, "image.png"),
    "Without sourceFilePath, relative path should resolve to vault root"
  );

  console.log("[PASS] testParseImagesPaths");
}

/**
 * Test imageToBase64 error handling.
 */
async function testImageToBase64Errors(): Promise<void> {
  // Test 1: Empty path throws
  try {
    await imageToBase64("");
    assert.fail("Should throw on empty path");
  } catch (error) {
    assert.ok(error instanceof Error, "Should throw Error");
    assert.ok(error.message.includes("path is required"), "Should mention path is required");
  }

  // Test 2: Non-existent file throws
  try {
    await imageToBase64("/nonexistent/path/image.png");
    assert.fail("Should throw on non-existent file");
  } catch (error) {
    assert.ok(error instanceof Error, "Should throw Error");
    assert.ok(error.message.includes("not found"), "Should mention file not found");
  }

  // Test 3: Unsupported extension throws
  try {
    await imageToBase64("/some/path/image.txt");
    assert.fail("Should throw on unsupported extension");
  } catch (error) {
    assert.ok(error instanceof Error, "Should throw Error");
    assert.ok(error.message.includes("Unsupported"), "Should mention unsupported format");
  }

  console.log("[PASS] testImageToBase64Errors");
}

/**
 * Test parseImages with multiple images.
 */
function testParseImagesMultiple(): void {
  const vaultPath = "/Users/test/vault";
  const content = `
# Document with images

First image: ![](./image1.png)

Second image: ![alt text](attachments/image2.jpg)

External: ![external](https://example.com/external.png)

Third: ![third](../images/image3.gif)
`;

  const images = parseImages(content, vaultPath, "/Users/test/vault/notes/note.md");
  assert.equal(images.length, 3, "Should parse 3 images (external URL skipped)");

  // Check paths are resolved correctly
  // Note: join normalizes paths, so ./ becomes just the directory
  assert.ok(images[0].path.includes("notes/image1.png"), `First image path: ${images[0].path}`);
  assert.ok(images[1].path.includes("attachments/image2.jpg"), `Second image path: ${images[1].path}`);
  assert.ok(images[2].path.includes("images/image3.gif"), `Third image path: ${images[2].path}`);

  console.log("[PASS] testParseImagesMultiple");
}

/**
 * Run all tests.
 */
async function runTests(): Promise<void> {
  console.log("Running image embedding tests...\n");

  testParseImagesPaths();
  await testImageToBase64Errors();
  testParseImagesMultiple();

  console.log("\nAll tests passed!");
}

// Run tests
runTests().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
