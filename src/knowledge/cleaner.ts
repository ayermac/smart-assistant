/**
 * Text cleaner - cleans raw text before chunking.
 *
 * Removes HTML tags, compresses blank lines, trims whitespace.
 * Extracts YAML frontmatter from Markdown files.
 */

/**
 * Clean text by removing HTML tags, compressing blank lines, and trimming lines.
 *
 * @param text - Raw text to clean
 * @returns Cleaned text
 */
export function cleanText(text: string): string {
  if (!text) return "";

  let result = text;

  // Remove HTML tags: <details>, <summary>, <br>, etc.
  // Match common HTML tags used in Markdown documentation
  result = result.replace(/<\/?(?:details|summary|br|div|span|p|code|pre|strong|em|a|ul|ol|li|table|tr|td|th|thead|tbody)[^>]*>/gi, "");

  // Remove HTML comments
  result = result.replace(/<!--[\s\S]*?-->/g, "");

  // Remove self-closing tags
  result = result.replace(/<br\s*\/?>/gi, "\n");

  // Compress consecutive blank lines: 3+ newlines → 2 newlines
  result = result.replace(/\n{3,}/g, "\n\n");

  // Trim each line's leading/trailing whitespace
  result = result
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

  // Remove leading/trailing blank lines
  result = result.trim();

  return result;
}

/**
 * Extract YAML frontmatter from text.
 *
 * Frontmatter is delimited by `---` at the start of the file:
 * ```
 * ---
 * title: My Document
 * date: 2026-05-23
 * ---
 *
 * Body content here...
 * ```
 *
 * @param text - Text with potential frontmatter
 * @returns Object with body text and parsed frontmatter (or null if none)
 */
export function extractFrontmatter(text: string): {
  body: string;
  frontmatter: Record<string, unknown> | null;
} {
  if (!text) {
    return { body: "", frontmatter: null };
  }

  // Check if text starts with frontmatter delimiter
  if (!text.startsWith("---\n")) {
    return { body: text, frontmatter: null };
  }

  // Find the closing delimiter
  const closeIndex = text.indexOf("\n---\n", 4);
  if (closeIndex === -1) {
    // No closing delimiter found
    return { body: text, frontmatter: null };
  }

  // Extract frontmatter content
  const frontmatterText = text.slice(4, closeIndex);
  const body = text.slice(closeIndex + 5);

  // Parse YAML-like frontmatter (simple key-value pairs)
  const frontmatter: Record<string, unknown> = {};
  const lines = frontmatterText.split("\n");

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value: unknown = line.slice(colonIndex + 1).trim();

      // Parse simple value types
      if (value === "true") {
        value = true;
      } else if (value === "false") {
        value = false;
      } else if (value === "null") {
        value = null;
      } else if (/^\d+$/.test(value as string)) {
        value = parseInt(value as string, 10);
      } else if (/^\d+\.\d+$/.test(value as string)) {
        value = parseFloat(value as string);
      } else if ((value as string).startsWith("[") && (value as string).endsWith("]")) {
        // Parse simple arrays: [item1, item2]
        try {
          value = (value as string)
            .slice(1, -1)
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
        } catch {
          // Keep as string if parsing fails
        }
      }

      if (key) {
        frontmatter[key] = value;
      }
    }
  }

  // If no valid frontmatter parsed, treat as regular text
  if (Object.keys(frontmatter).length === 0) {
    return { body: text, frontmatter: null };
  }

  return { body: body.trim(), frontmatter };
}
