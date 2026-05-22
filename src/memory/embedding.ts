/**
 * Embedding client for Doubao API.
 *
 * Generates text embeddings using the Doubao embedding API
 * (OpenAI-compatible format).
 */

/**
 * Configuration for the embedding client.
 */
export interface EmbeddingConfig {
  /** Base URL for the embedding API */
  baseUrl: string;
  /** Model name to use for embeddings */
  model: string;
  /** API key for authentication */
  apiKey: string;
}

/**
 * Default embedding configuration from environment variables.
 */
export function createDefaultEmbeddingConfig(env: NodeJS.ProcessEnv = process.env): EmbeddingConfig {
  // Use OPENAI_API_KEY if available (for Doubao/OpenAI-compatible endpoints)
  // Fall back to ANTHROPIC_API_KEY for backwards compatibility
  const apiKey = env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY || "";

  return {
    baseUrl: env.EMBEDDING_BASE_URL || "https://ark.cn-beijing.volces.com/api/coding/v3",
    model: env.EMBEDDING_MODEL || "doubao-embedding-vision",
    apiKey,
  };
}

/**
 * Get embedding vector for a text.
 *
 * @param text - Text to embed
 * @param config - Embedding configuration
 * @returns Embedding vector as array of numbers
 * @throws Error if API call fails
 */
export async function getEmbedding(
  text: string,
  config: EmbeddingConfig
): Promise<number[]> {
  if (!config.apiKey) {
    throw new Error("Embedding API key not configured. Set ANTHROPIC_API_KEY environment variable.");
  }

  const response = await fetch(`${config.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Embedding API failed: ${response.status} ${response.statusText}\n${errorText}`
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
