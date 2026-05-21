/**
 * get_time tool - returns the current date and time.
 *
 * This is the first local tool for the smart-assistant, demonstrating
 * the tool calling capability with TypeBox schema validation.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";

/**
 * Parameters schema for get_time tool.
 */
const GetTimeParameters = Type.Object({
  timezone: Type.Optional(
    Type.String({
      description:
        "IANA timezone identifier like America/New_York. Defaults to UTC.",
    })
  ),
});

type GetTimeParams = Static<typeof GetTimeParameters>;

/**
 * Tool result details for get_time.
 */
interface GetTimeDetails {
  timezone: string;
  iso: string;
}

/**
 * get_time tool implementation.
 *
 * Returns the current date and time in the specified timezone (defaults to UTC).
 * Uses the IANA timezone format for timezone specification.
 */
export const get_time: AgentTool<typeof GetTimeParameters, GetTimeDetails> = {
  name: "get_time",
  description: "Get the current date and time. Optionally specify a timezone.",
  label: "Get Current Time",
  parameters: GetTimeParameters,

  async execute(toolCallId, params, signal, onUpdate) {
    const tz = params.timezone ?? "UTC";
    const now = new Date();

    try {
      // Format the time in the specified timezone
      const timeStr = now.toLocaleString("en-US", {
        timeZone: tz,
        dateStyle: "full",
        timeStyle: "long",
      });

      return {
        content: [
          {
            type: "text",
            text: `Current time in ${tz}: ${timeStr}`,
          },
        ],
        details: {
          timezone: tz,
          iso: now.toISOString(),
        },
      };
    } catch (error) {
      // Handle invalid timezone error
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown error occurred while formatting time";

      return {
        content: [
          {
            type: "text",
            text: `Invalid timezone '${tz}'. Use IANA timezone identifiers like 'America/New_York', 'Europe/London', or 'Asia/Shanghai'. Error: ${errorMessage}`,
          },
        ],
        details: {
          timezone: tz,
          iso: now.toISOString(),
        },
      };
    }
  },
};
