/**
 * Assistant Controller - manages the agent runtime and message processing.
 *
 * This module wraps pi-agent-core's Agent class and provides a simplified interface
 * for the CLI to send messages and receive streaming events.
 */

import { Agent, type AgentEvent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { getDefaultModel } from "../model.js";
import { createAllTools } from "../tools/index.js";
import { VectorMemoryStore, createDefaultEmbeddingConfig } from "../memory/index.js";
import { VectorKnowledgeStore } from "../knowledge/index.js";
import { FilePlanStore } from "../planning/index.js";
import type { SessionStore } from "../session/types.js";
import type { AssistantEvent } from "./types.js";

/**
 * System prompt for the smart-assistant.
 *
 * Emphasizes clarification and conservative failure behavior as per AGT-06.
 * Phase 4 adds memory behavior rules (MEM-04, MEM-05).
 */
const SYSTEM_PROMPT = `You are a helpful local assistant. When uncertain, ask clarifying questions. If you cannot answer confidently, say so.

You have access to a \`remember\` tool for storing long-term facts and preferences.
Only use it when the user explicitly asks you to remember something.
Do not automatically store conversation turns as memories.

When recalling memories, cite the memory content clearly in your response.
Distinguish information from memory vs knowledge search when relevant.

You have access to a \`search_knowledge\` tool for searching the local Markdown/text knowledge base.
Use it when the user asks about information that might be in their notes or documents.
When citing knowledge search results, use the format: According to \`path > heading\`...
If the knowledge base does not contain relevant information for the user's question, state explicitly: "The local knowledge base does not contain information about [topic]."
Do not fabricate knowledge base content. Only report what the search_knowledge tool returns.

You have access to planning tools (\`create_plan\`, \`update_plan\`) for breaking down complex tasks.
When the user asks for help with a multi-step task or complex goal, consider using \`create_plan\` to structure the approach first.
Use planning when:
- The task has multiple distinct steps
- The user wants to track progress over time
- The task benefits from sequential execution
After completing a step, use \`update_plan\` to mark it as completed.
When all steps are done, the plan will be marked as completed automatically.`;

/**
 * AssistantController manages the agent runtime and processes user messages.
 *
 * Responsibilities:
 * - Initialize the Agent with system prompt and model
 * - Validate API key availability
 * - Stream agent events to a callback
 * - Handle errors gracefully
 * - Persist session messages after each agent turn
 */
export class AssistantController {
  private readonly agent: Agent;
  private readonly sessionStore: SessionStore;
  private readonly sessionId: string;
  private onEvent: ((event: AssistantEvent) => void) | null = null;

  /**
   * Creates a new AssistantController.
   *
   * @param initialMessages - Messages to restore from a previous session
   * @param sessionStore - Session persistence store
   * @param sessionId - ID of the current session
   * @throws Error if required API key is not set
   */
  private constructor(
    initialMessages: AgentMessage[],
    sessionStore: SessionStore,
    sessionId: string,
    agent: Agent
  ) {
    this.sessionStore = sessionStore;
    this.sessionId = sessionId;
    this.agent = agent;

    // Subscribe to agent events once in constructor (fixes duplicate subscription bug)
    this.agent.subscribe((event: AgentEvent) => {
      this.handleAgentEvent(event);
    });
  }

  /**
   * Create and initialize an AssistantController.
   * Use this factory method instead of constructor.
   *
   * @param initialMessages - Messages to restore from a previous session
   * @param sessionStore - Session persistence store
   * @param sessionId - ID of the current session
   * @throws Error if required API key is not set
   */
  static async create(
    initialMessages: AgentMessage[],
    sessionStore: SessionStore,
    sessionId: string
  ): Promise<AssistantController> {
    // Validate API key based on provider
    const provider = process.env.SMART_ASSISTANT_PROVIDER?.trim() || "anthropic";
    const apiKeyEnv = provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";

    if (!process.env[apiKeyEnv]) {
      throw new Error(`${apiKeyEnv} environment variable is required for provider "${provider}"`);
    }

    // Create and initialize memory store (vector-based)
    const embeddingConfig = createDefaultEmbeddingConfig();
    const memoryStore = new VectorMemoryStore(embeddingConfig);
    await memoryStore.init();

    // Create and initialize knowledge store (vector-based)
    const knowledgeStore = new VectorKnowledgeStore({ embeddingConfig });
    await knowledgeStore.init();

    // Create plan store
    const planStore = new FilePlanStore();

    // Initialize agent with memory, knowledge, and planning tools
    const agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model: getDefaultModel(),
        thinkingLevel: "off",
        tools: createAllTools(memoryStore, knowledgeStore, planStore),
        messages: initialMessages,
      },
    });

    return new AssistantController(initialMessages, sessionStore, sessionId, agent);
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

    // Store callback for event routing
    this.onEvent = onEvent;

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
   * Get a copy of the current message array.
   *
   * @returns Copy of the agent's message array
   */
  getMessages(): AgentMessage[] {
    return [...this.agent.state.messages];
  }

  /**
   * Handle agent events and convert to assistant events.
   */
  private handleAgentEvent(event: AgentEvent): void {
    if (!this.onEvent) {
      return;
    }

    switch (event.type) {
      case "message_update": {
        const msgEvent = event.assistantMessageEvent;
        if (msgEvent.type === "text_delta") {
          this.onEvent({ type: "text_delta", delta: msgEvent.delta });
        }
        break;
      }

      case "message_end": {
        if (event.message.role === "assistant" && event.message.errorMessage) {
          this.onEvent({ type: "error", message: event.message.errorMessage });
        }
        break;
      }

      case "tool_execution_start": {
        this.onEvent({ type: "tool_start", toolName: event.toolName });
        break;
      }

      case "tool_execution_end": {
        this.onEvent({ type: "tool_end", toolName: event.toolName, isError: event.isError });
        break;
      }

      case "agent_end": {
        // Persist session messages after agent finishes
        void this.sessionStore.save(this.sessionId, event.messages);
        break;
      }
    }
  }
}
