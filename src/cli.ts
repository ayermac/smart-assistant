#!/usr/bin/env node

// Load environment variables from .env file
import { config } from "dotenv";
config({ quiet: true });

import { stdin, stdout, stderr } from "node:process";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { SMART_ASSISTANT_DATA_DIR_ENV } from "./config.js";
import { type AssistantEvent } from "./assistant/index.js";
import {
  buildUsage,
  createAssistantRuntime,
  parseArgs,
  readPackageVersion,
  type CliOptions,
} from "./runtime.js";

async function runInteractive(options: CliOptions): Promise<void> {
  let runtime: Awaited<ReturnType<typeof createAssistantRuntime>>;
  try {
    runtime = await createAssistantRuntime(options, {
      onStatus: (message) => stdout.write(`${message}\n`),
      onWarning: (message) => stderr.write(`Warning: ${message}\n`),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });

  stdout.write("smart-assistant local CLI\n");
  stdout.write(`Data dir: ${runtime.dataDir}\n`);
  if (runtime.isNewSession) {
    stdout.write(`New session: ${runtime.session.id}\n`);
  } else {
    stdout.write(`Resumed session: ${runtime.session.id} (${runtime.session.messages.length} messages)\n`);
  }
  stdout.write(`Set ${SMART_ASSISTANT_DATA_DIR_ENV} or pass --data-dir to change it.\n`);
  stdout.write("Type /help for commands.\n");

  // Handle SIGINT for graceful abort
  let isPromptInProgress = false;
  const sigintHandler = async () => {
    if (isPromptInProgress) {
      runtime.controller.abort();
      stdout.write("\n[Aborted]\n");
    } else {
      await runtime.stop();
      rl.close();
      process.exit(0);
    }
  };
  process.on("SIGINT", sigintHandler);

  // Handle SIGTERM for graceful shutdown
  process.on("SIGTERM", async () => {
    await runtime.stop();
    rl.close();
    process.exit(0);
  });

  // ANSI color codes
  const GREEN = "\x1b[32m";
  const RED = "\x1b[31m";
  const RESET = "\x1b[0m";

  // Track first text delta for each response
  let isFirstDelta = true;

  // Event handler for assistant events
  function handleAssistantEvent(event: AssistantEvent): void {
    switch (event.type) {
      case "text_delta":
        // Validate delta is non-empty before writing
        if (event.delta && event.delta.length > 0) {
          if (isFirstDelta) {
            stdout.write("assistant> ");
            isFirstDelta = false;
          }
          stdout.write(event.delta);
        }
        break;
      case "error":
        stderr.write(`\n${RED}[Error: ${event.message}]${RESET}\n`);
        break;
      case "tool_start":
        stdout.write(`\n[Tool: ${event.toolName}]`);
        break;
      case "tool_end":
        if (event.isError) {
          stdout.write(` ${RED}failed${RESET}\n`);
        } else {
          stdout.write(` ${GREEN}done${RESET}\n`);
        }
        break;
    }
  }

  try {
    while (true) {
      const input = await rl.question("you> ");
      const message = input.trim();

      if (message === "" || message === "/exit") {
        break;
      }

      if (message === "/help") {
        stdout.write("Commands: /help, /exit\n");
        continue;
      }

      isFirstDelta = true;
      isPromptInProgress = true;
      try {
        await runtime.controller.prompt(message, handleAssistantEvent);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        stderr.write(`\n[Error: ${errorMessage}]\n`);
      } finally {
        isPromptInProgress = false;
      }
      stdout.write("\n");
    }
  } finally {
    process.off("SIGINT", sigintHandler);
    await runtime.stop();
    rl.close();
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.kind === "help") {
    stdout.write(`${buildUsage()}\n`);
    return;
  }

  if (parsed.kind === "version") {
    stdout.write(`${await readPackageVersion()}\n`);
    return;
  }

  if (parsed.kind === "error") {
    console.error(parsed.message);
    process.exitCode = 1;
    return;
  }

  await runInteractive(parsed.options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
