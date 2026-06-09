/**
 * Assistant module - exports types and controller for the assistant runtime.
 */

export type { AssistantEvent, TextDeltaEvent, ErrorEvent, ToolStartEvent, ToolEndEvent } from "./types.js";
export { AssistantController, type AssistantControllerOptions } from "./controller.js";
