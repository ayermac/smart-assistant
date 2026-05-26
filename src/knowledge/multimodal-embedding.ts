/**
 * Multimodal embedding client for Doubao API.
 *
 * Generates embeddings for text + image combinations using
 * the doubao-embedding-vision model (250615+ version).
 *
 * Supports:
 * - Text-only embeddings (backward compatible with getEmbedding)
 * - Image-only embeddings (base64 or URL)
 * - Text + image fusion embeddings
 */

import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import type { EmbeddingConfig } from "../memory/embedding.js";

/**
 * Input for multimodal embedding.
 */
export interface MultimodalInput {
  /** Text content to embed */
  text?: string;
  /** Image as base64 string or public URL */
  image?: string;
}

/**
 * Supported image formats for embedding.
 */
const SUPPORTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

/**
 * Maximum image size in bytes (4MB).
 * Images larger than this are skipped to avoid API limits.
 */
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

/**
 * Get multimodal embedding for text and/or image.
 *
 * Uses doubao-embedding-vision model which supports:
 * - Text-only: returns text embedding
 * - Image-only: returns image embedding
 * - Text + Image: returns fused embedding (single 2048-dim vector)
 *
 * @param input - Multimodal input (text and/or image)
 * @param config - Embedding configuration
 * @returns 2048-dimensional embedding vector
 * @throws Error if API call fails or no input provided
 */
export async function getMultimodalEmbedding(
  input: MultimodalInput,
  config: EmbeddingConfig
): Promise<number[]> {
  if (!config.apiKey) {
    throw new Error("Embedding API key not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable.");
  }

  // Validate input
  if (!input.text && !input.image) {
    throw new Error("At least one of text or image must be provided");
  }

  // Build request body based on input type
  let requestBody: unknown;

  if (input.image && input.text) {
    // Multimodal: text + image
    // doubao-embedding-vision 250615+ supports mixed input
    requestBody = {
      model: config.model,
      input: [
        { type: "text", text: input.text },
        { type: "image_url", image_url: { url: input.image } },
      ],
    };
  } else if (input.image) {
    // Image only
    requestBody = {
      model: config.model,
      input: [
        { type: "image_url", image_url: { url: input.image } },
      ],
    };
  } else {
    // Text only - use standard format for backward compatibility
    requestBody = {
      model: config.model,
      input: input.text,
    };
  }

  const response = await fetch(`${config.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Multimodal embedding API failed: ${response.status} ${response.statusText}\n${errorText}`
    );
  }

  const data = await response.json();

  if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
    throw new Error("Invalid embedding response: missing data array");
  }

  const embedding = data.data[0].embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("Invalid embedding response: embedding is not an array");
  }

  return embedding;
}

/**
 * Read an image file and convert to base64 data URL.
 *
 * Supports: PNG, JPG, JPEG, GIF, WebP
 * Skips images larger than 4MB.
 *
 * @param imagePath - Absolute path to the image file
 * @returns Base64 data URL (e.g., "data:image/png;base64,...") or empty string if skipped
 * @throws Error with detailed message if file doesn't exist or is not a supported format
 */
export async function imageToBase64(imagePath: string): Promise<string> {
  if (!imagePath) {
    throw new Error("[imageToBase64] Image path is required but was empty");
  }

  // Check file extension
  const ext = extname(imagePath).toLowerCase();
  if (!SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
    throw new Error(
      `[imageToBase64] Unsupported image format '${ext}' for path: ${imagePath}. ` +
      `Supported formats: ${SUPPORTED_IMAGE_EXTENSIONS.join(", ")}`
    );
  }

  // Check file exists and size
  let fileStat;
  try {
    fileStat = await stat(imagePath);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[imageToBase64] Image file not found: ${imagePath}. ` +
      `Make sure the path is correct and the file exists. ` +
      `Original error: ${errorMsg}`
    );
  }

  if (!fileStat.isFile()) {
    throw new Error(
      `[imageToBase64] Path exists but is not a file: ${imagePath}`
    );
  }

  if (fileStat.size === 0) {
    throw new Error(
      `[imageToBase64] Image file is empty (0 bytes): ${imagePath}`
    );
  }

  if (fileStat.size > MAX_IMAGE_SIZE) {
    // Skip large images with detailed warning
    console.warn(
      `[imageToBase64] Image too large (${(fileStat.size / 1024 / 1024).toFixed(2)} MB > ` +
      `${MAX_IMAGE_SIZE / 1024 / 1024} MB limit), skipping: ${imagePath}`
    );
    return "";
  }

  // Read file and convert to base64
  let buffer: Buffer;
  try {
    buffer = await readFile(imagePath);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[imageToBase64] Failed to read image file: ${imagePath}. ` +
      `Original error: ${errorMsg}`
    );
  }

  const base64 = buffer.toString("base64");

  // Determine MIME type
  const mimeType = getMimeType(ext);

  return `data:${mimeType};base64,${base64}`;
}

/**
 * Get MIME type from file extension.
 */
function getMimeType(ext: string): string {
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return "image/png"; // fallback
  }
}

/**
 * Check if an image file is supported and within size limits.
 *
 * @param imagePath - Path to the image file
 * @returns true if the image can be embedded
 */
export async function isImageEmbeddable(imagePath: string): Promise<boolean> {
  if (!imagePath) return false;

  const ext = extname(imagePath).toLowerCase();
  if (!SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
    return false;
  }

  try {
    const fileStat = await stat(imagePath);
    return fileStat.size <= MAX_IMAGE_SIZE;
  } catch {
    return false;
  }
}
