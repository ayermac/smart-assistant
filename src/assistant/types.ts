/**
 * Types for the Assistant Controller.
 *
 * AssistantEvent represents events emitted during assistant response streaming.
 */

/**
 * Event emitted when the assistant produces a text delta.
 */
export interface TextDeltaEvent {
  readonly type: "text_delta";
  readonly delta: string;
}

/**
 * Event emitted when an error occurs.
 */
export interface ErrorEvent {
  readonly type: "error";
  readonly message: string;
}

/**
 * Event emitted when a tool starts executing.
 */
export interface ToolStartEvent {
  readonly type: "tool_start";
  readonly toolName: string;
}

/**
 * Event emitted when a tool finishes executing.
 */
export interface ToolEndEvent {
  readonly type: "tool_end";
  readonly toolName: string;
  readonly isError: boolean;
}

/**
 * Union type for all assistant events.
 */
export type AssistantEvent = TextDeltaEvent | ErrorEvent | ToolStartEvent | ToolEndEvent;
