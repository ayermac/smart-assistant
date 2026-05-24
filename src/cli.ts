#!/usr/bin/env node

// Load environment variables from .env file
import { config } from "dotenv";
config();

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { stdin, stdout, stderr } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveDataDir, resolveDataPaths, SMART_ASSISTANT_DATA_DIR_ENV } from "./config.js";
import { AssistantController, type AssistantEvent } from "./assistant/index.js";
import { FileSessionStore, type SessionFile } from "./session/index.js";
import { VaultWatcher } from "./knowledge/watcher.js";

type CliOptions = {
  dataDir?: string;
  sessionId?: string;
  newSession?: boolean;
};

const USAGE = `smart-assistant [--data-dir <path>] [--session <id>] [--new]

Options:
  -h, --help           Show this help message
  -v, --version        Show package version
      --data-dir <path> Override SMART_ASSISTANT_DATA_DIR
      --session <id>   Resume specific session
      --new            Start a new session (don't resume latest)

Commands:
  /help                Show interactive commands
  /exit                Exit the CLI`;

function parseArgs(argv: string[]): { kind: "run"; options: CliOptions } | { kind: "help" } | { kind: "version" } | { kind: "error"; message: string } {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      return { kind: "help" };
    }

    if (arg === "--version" || arg === "-v") {
      return { kind: "version" };
    }

    if (arg === "--data-dir") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        return { kind: "error", message: "Missing value for --data-dir" };
      }
      options.dataDir = value;
      index += 1;
      continue;
    }

    if (arg === "--session") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        return { kind: "error", message: "Missing value for --session" };
      }
      options.sessionId = value;
      index += 1;
      continue;
    }

    if (arg === "--new") {
      options.newSession = true;
      continue;
    }

    return { kind: "error", message: `Unknown option: ${arg}` };
  }

  // Validate: cannot use --session and --new together
  if (options.sessionId && options.newSession) {
    return { kind: "error", message: "Cannot use --session and --new together" };
  }

  return { kind: "run", options };
}

async function readPackageVersion(): Promise<string> {
  const packagePath = resolve(dirname(fileURLToPath(import.meta.url)), "../package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as { version?: string };
  return packageJson.version ?? "0.0.0";
}

/**
 * Resolve session based on CLI options.
 *
 * Priority:
 * 1. If sessionId provided: load that session or throw error
 * 2. If newSession true: create new session
 * 3. Default: load latest or create new if none exist
 */
async function resolveSession(
  options: CliOptions,
  store: FileSessionStore
): Promise<{ session: SessionFile; isNew: boolean }> {
  // Explicit session ID
  if (options.sessionId) {
    const session = await store.load(options.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${options.sessionId}`);
    }
    return { session, isNew: false };
  }

  // Explicit new session
  if (options.newSession) {
    return { session: store.create(), isNew: true };
  }

  // Default: resume latest or create new
  const latest = await store.getLatest();
  if (latest) {
    const session = await store.load(latest.id);
    if (session) {
      return { session, isNew: false };
    }
  }

  return { session: store.create(), isNew: true };
}

async function runInteractive(options: CliOptions): Promise<void> {
  const dataDir = options.dataDir ?? resolveDataDir();
  const dataPaths = resolveDataPaths(process.env);

  // Create session store
  const sessionStore = new FileSessionStore(dataPaths.sessions);

  // Resolve session (new or resume)
  let session: SessionFile;
  let isNew: boolean;
  try {
    const resolved = await resolveSession(options, sessionStore);
    session = resolved.session;
    isNew = resolved.isNew;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
    return;
  }

  // Initialize assistant controller with session
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH?.trim();
  let controller: AssistantController;
  try {
    controller = await AssistantController.create(session.messages, sessionStore, session.id, {
      vaultPath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
    return;
  }

  // Set up Obsidian vault watching if configured
  let vaultWatcher: VaultWatcher | null = null;
  if (vaultPath) {
    try {
      const knowledgeStore = controller.getKnowledgeStore();

      // Sync vault (incremental index based on modification times)
      stdout.write(`Syncing Obsidian vault: ${vaultPath}\n`);
      const syncStats = await knowledgeStore.syncVault(vaultPath);
      stdout.write(`Vault sync complete: ${syncStats.added} added, ${syncStats.updated} updated, ${syncStats.removed} removed\n`);

      // Start file watcher
      vaultWatcher = new VaultWatcher({
        vaultPath,
        store: knowledgeStore,
      });
      vaultWatcher.start();
      stdout.write(`Watching vault for changes...\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stderr.write(`Warning: Failed to set up vault watching: ${message}\n`);
      // Continue without watching - not a fatal error
    }
  }

  const rl = createInterface({ input: stdin, output: stdout });

  stdout.write("smart-assistant local CLI\n");
  stdout.write(`Data dir: ${dataDir}\n`);
  if (isNew) {
    stdout.write(`New session: ${session.id}\n`);
  } else {
    stdout.write(`Resumed session: ${session.id} (${session.messages.length} messages)\n`);
  }
  stdout.write(`Set ${SMART_ASSISTANT_DATA_DIR_ENV} or pass --data-dir to change it.\n`);
  stdout.write("Type /help for commands.\n");

  // Handle SIGINT for graceful abort
  let isPromptInProgress = false;
  const sigintHandler = async () => {
    if (isPromptInProgress) {
      controller.abort();
      stdout.write("\n[Aborted]\n");
    } else {
      // Stop vault watcher gracefully
      if (vaultWatcher) {
        await vaultWatcher.stop();
      }
      rl.close();
      process.exit(0);
    }
  };
  process.on("SIGINT", sigintHandler);

  // Handle SIGTERM for graceful shutdown
  process.on("SIGTERM", async () => {
    if (vaultWatcher) {
      await vaultWatcher.stop();
    }
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
        await controller.prompt(message, handleAssistantEvent);
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
    rl.close();
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.kind === "help") {
    stdout.write(`${USAGE}\n`);
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
