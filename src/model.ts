/**
 * Model configuration module for smart-assistant.
 *
 * This module provides centralized model selection using the pi-ai model registry.
 * Supports both Anthropic Claude and OpenAI-compatible endpoints.
 *
 * Configuration via environment variables:
 * - SMART_ASSISTANT_PROVIDER: "anthropic" (default) or "openai"
 * - SMART_ASSISTANT_MODEL: Model ID (e.g., "claude-sonnet-4-20250514" or "gpt-4o")
 * - OPENAI_API_KEY: Required for OpenAI provider
 * - OPENAI_BASE_URL: Optional, for OpenAI-compatible endpoints (e.g., Ollama, vLLM, etc.)
 * - ANTHROPIC_API_KEY: Required for Anthropic provider
 */

import { getModel, type Model, type Api } from "@earendil-works/pi-ai";
import {
  SMART_ASSISTANT_PROVIDER_ENV,
  SMART_ASSISTANT_MODEL_ENV,
} from "./config.js";

/**
 * Default model for the smart-assistant.
 *
 * Uses Claude Sonnet 4 via Anthropic as the default model.
 * Can be overridden via SMART_ASSISTANT_PROVIDER and SMART_ASSISTANT_MODEL
 * environment variables.
 *
 * For OpenAI-compatible endpoints (Ollama, vLLM, etc.):
 * - Set SMART_ASSISTANT_PROVIDER=openai
 * - Set SMART_ASSISTANT_MODEL=<model-name>
 * - Set OPENAI_API_KEY=<your-key> (can be any non-empty string for local models)
 * - Set OPENAI_BASE_URL=<your-endpoint> (e.g., http://localhost:11434/v1 for Ollama)
 */
export function getDefaultModel(): Model<Api> {
  const provider = process.env[SMART_ASSISTANT_PROVIDER_ENV]?.trim() || "anthropic";
  const modelId = process.env[SMART_ASSISTANT_MODEL_ENV]?.trim() || "claude-sonnet-4-20250514";

  // Try to get model from registry first
  let model: Model<Api> | undefined = getModel(provider as "anthropic", modelId as "claude-sonnet-4-20250514") as Model<Api> | undefined;

  // If model not found and provider is openai, create a fallback model config
  // This allows custom model names for OpenAI-compatible endpoints
  if (!model && provider === "openai") {
    // Use gpt-4o as a template and override the id with custom model name
    const gpt4o = getModel("openai", "gpt-4o");
    if (gpt4o) {
      // Get custom base URL from environment if provided
      const customBaseUrl = process.env.OPENAI_BASE_URL;

      // Override id to use custom model name - the actual model will be determined
      // by the OPENAI_BASE_URL and the model id sent in the API request
      model = {
        ...gpt4o,
        id: modelId,
        name: modelId,
        // Override baseUrl if custom endpoint is provided
        ...(customBaseUrl ? { baseUrl: customBaseUrl } : {}),
        // Use openai-completions (Chat API) instead of openai-responses
        // Many OpenAI-compatible endpoints don't support Responses API
        api: "openai-completions",
      } as unknown as Model<Api>;
    }
  }

  if (!model) {
    throw new Error(
      `Model not found: provider="${provider}", model="${modelId}". ` +
      `Check SMART_ASSISTANT_PROVIDER and SMART_ASSISTANT_MODEL environment variables.`
    );
  }

  return model;
}
