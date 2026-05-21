/**
 * Assistant Controller - manages the agent runtime and message processing.
 *
 * This module wraps pi-agent-core's Agent class and provides a simplified interface
 * for the CLI to send messages and receive streaming events.
 */

import { Agent, type AgentEvent } from "@earendil-works/pi-agent-core";
import { getDefaultModel } from "../model.js";
import { ALL_TOOLS } from "../tools/index.js";
import type { AssistantEvent } from "./types.js";

/**
 * System prompt for the smart-assistant.
 *
 * Emphasizes clarification and conservative failure behavior as per AGT-06.
 */
const SYSTEM_PROMPT = `You are a helpful local assistant. When uncertain, ask clarifying questions. If you cannot answer confidently, say so.`;

/**
 * AssistantController manages the agent runtime and processes user messages.
 *
 * Responsibilities:
 * - Initialize the Agent with system prompt and model
 * - Validate API key availability
 * - Stream agent events to a callback
 * - Handle errors gracefully
 */
export class AssistantController {
  private readonly agent: Agent;

  /**
   * Creates a new AssistantController.
   *
   * @throws Error if ANTHROPIC_API_KEY is not set
   */
  constructor() {
    // Validate API key before creating agent
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }

    // Initialize agent with default model, system prompt, and tools
    this.agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model: getDefaultModel(),
        thinkingLevel: "off",
        tools: ALL_TOOLS,
        messages: [],
      },
    });
  }

  /**
   * Send a message to the assistant and stream events.
   *
   * @param message - The user message (must be non-empty after trimming)
   * @param onEvent - Callback for assistant events
   * @returns Promise that resolves when the agent finishes processing
   */
  async prompt(message: string, onEvent: (event: AssistantEvent) => void): Promise<void> {
    // Validate non-empty message
    const trimmed = message.trim();
    if (trimmed === "") {
      onEvent({ type: "error", message: "Message cannot be empty" });
      return;
    }

    // Subscribe to agent events before calling prompt
    this.agent.subscribe((event: AgentEvent) => {
      this.handleAgentEvent(event, onEvent);
    });

    // Send message to agent
    await this.agent.prompt(trimmed);
  }

  /**
   * Abort the current agent operation if one is in progress.
   */
  abort(): void {
    this.agent.abort();
  }

  /**
   * Handle agent events and convert to assistant events.
   */
  private handleAgentEvent(event: AgentEvent, onEvent: (event: AssistantEvent) => void): void {
    switch (event.type) {
      case "message_update": {
        const msgEvent = event.assistantMessageEvent;
        if (msgEvent.type === "text_delta") {
          onEvent({ type: "text_delta", delta: msgEvent.delta });
        }
        break;
      }

      case "message_end": {
        if (event.message.role === "assistant" && event.message.errorMessage) {
          onEvent({ type: "error", message: event.message.errorMessage });
        }
        break;
      }

      case "tool_execution_start": {
        onEvent({ type: "tool_start", toolName: event.toolName });
        break;
      }

      case "tool_execution_end": {
        onEvent({ type: "tool_end", toolName: event.toolName, isError: event.isError });
        break;
      }
    }
  }
}
