#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveDataDir, SMART_ASSISTANT_DATA_DIR_ENV } from "./config.js";

type CliOptions = {
  dataDir?: string;
};

const USAGE = `smart-assistant [--data-dir <path>]

Options:
  -h, --help           Show this help message
  -v, --version        Show package version
      --data-dir <path> Override SMART_ASSISTANT_DATA_DIR

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

    return { kind: "error", message: `Unknown option: ${arg}` };
  }

  return { kind: "run", options };
}

async function readPackageVersion(): Promise<string> {
  const packagePath = resolve(dirname(fileURLToPath(import.meta.url)), "../package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as { version?: string };
  return packageJson.version ?? "0.0.0";
}

async function runInteractive(options: CliOptions): Promise<void> {
  const dataDir = options.dataDir ?? resolveDataDir();
  const rl = createInterface({ input: stdin, output: stdout });

  stdout.write("smart-assistant local CLI\n");
  stdout.write(`Data dir: ${dataDir}\n`);
  stdout.write(`Set ${SMART_ASSISTANT_DATA_DIR_ENV} or pass --data-dir to change it.\n`);
  stdout.write("Type /help for commands.\n");

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

      stdout.write("assistant> Agent runtime is not connected yet. Phase 2 will wire pi-agent-core and pi-ai.\n");
    }
  } finally {
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
