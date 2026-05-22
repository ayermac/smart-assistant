/**
 * mock_failure tool - simulates tool failure for testing error handling.
 *
 * This tool always returns an error result, used for testing
 * error handling and recovery scenarios in the evaluation harness.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";

/**
 * Parameters schema for mock_failure tool.
 * Accepts an optional message to customize the error.
 */
const MockFailureParameters = Type.Object({
  message: Type.Optional(
    Type.String({
      description: "Optional custom error message. Defaults to 'Mock failure for testing'.",
    })
  ),
});

type MockFailureParams = Static<typeof MockFailureParameters>;

/**
 * Tool result details for mock_failure.
 */
interface MockFailureDetails {
  error: string;
  type: "mock_failure";
  recoverable: boolean;
}

/**
 * mock_failure tool implementation.
 *
 * Always returns an error result to test error handling.
 * Used by evaluation harness case 8 to verify error handling.
 */
export const mock_failure: AgentTool<typeof MockFailureParameters, MockFailureDetails> = {
  name: "mock_failure",
  description:
    "Mock tool that always fails. Used for testing error handling. Call this tool to simulate a tool failure scenario.",
  label: "Mock Failure",
  parameters: MockFailureParameters,

  async execute(toolCallId, params, signal, onUpdate) {
    const customMessage = params.message ?? "Mock failure for testing";

    // Return an error result
    return {
      content: [
        {
          type: "text",
          text: `Error: ${customMessage}`,
        },
      ],
      details: {
        error: customMessage,
        type: "mock_failure" as const,
        recoverable: true,
      },
    };
  },
};
