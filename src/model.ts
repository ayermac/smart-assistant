/**
 * Model configuration module for smart-assistant.
 *
 * This module provides centralized model selection using the pi-ai model registry.
 * The default model can be overridden via environment variables in later phases.
 */

import { getModel } from "@earendil-works/pi-ai";

/**
 * Default model for the smart-assistant.
 *
 * Uses Claude Sonnet 4 via Anthropic as the default model.
 * This can be overridden via SMART_ASSISTANT_PROVIDER and SMART_ASSISTANT_MODEL
 * environment variables in future phases.
 */
export function getDefaultModel() {
  return getModel("anthropic", "claude-sonnet-4-20250514");
}
