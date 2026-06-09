import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveDataDir,
  resolveDataPaths,
  resolveKnowledgeSourceDir,
  SMART_ASSISTANT_DATA_DIR_ENV,
  type DataPaths,
} from "./config.js";
import { AssistantController } from "./assistant/index.js";
import { FileSessionStore, type SessionFile } from "./session/index.js";
import { VaultWatcher } from "./knowledge/watcher.js";

export type CliOptions = {
  dataDir?: string;
  sessionId?: string;
  newSession?: boolean;
};

export type ParsedArgs =
  | { kind: "run"; options: CliOptions }
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string };

export interface RuntimePaths {
  dataDir: string;
  dataPaths: DataPaths;
  knowledgeSourceDir: string;
}

export interface AssistantRuntime extends RuntimePaths {
  session: SessionFile;
  isNewSession: boolean;
  controller: AssistantController;
  vaultWatcher: VaultWatcher | null;
  stop(): Promise<void>;
}

export function buildUsage(binaryName = "smart-assistant"): string {
  return `${binaryName} [--data-dir <path>] [--session <id>] [--new]

Options:
  -h, --help           Show this help message
  -v, --version        Show package version
      --data-dir <path> Override SMART_ASSISTANT_DATA_DIR
      --session <id>   Resume specific session
      --new            Start a new session (don't resume latest)

Commands:
  /help                Show interactive commands
  /exit                Exit the CLI`;
}

export function parseArgs(argv: string[]): ParsedArgs {
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

  if (options.sessionId && options.newSession) {
    return { kind: "error", message: "Cannot use --session and --new together" };
  }

  return { kind: "run", options };
}

export async function readPackageVersion(): Promise<string> {
  const packagePath = resolve(dirname(fileURLToPath(import.meta.url)), "../package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as { version?: string };
  return packageJson.version ?? "0.0.0";
}

export function resolveRuntimePaths(
  options: CliOptions,
  env: NodeJS.ProcessEnv = process.env
): RuntimePaths {
  const runtimeEnv = {
    ...env,
    ...(options.dataDir ? { [SMART_ASSISTANT_DATA_DIR_ENV]: options.dataDir } : {}),
  };

  return {
    dataDir: resolveDataDir(runtimeEnv),
    dataPaths: resolveDataPaths(runtimeEnv),
    knowledgeSourceDir: resolveKnowledgeSourceDir(runtimeEnv),
  };
}

export async function resolveSession(
  options: CliOptions,
  store: FileSessionStore
): Promise<{ session: SessionFile; isNew: boolean }> {
  if (options.sessionId) {
    const session = await store.load(options.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${options.sessionId}`);
    }
    return { session, isNew: false };
  }

  if (options.newSession) {
    return { session: store.create(), isNew: true };
  }

  const latest = await store.getLatest();
  if (latest) {
    const session = await store.load(latest.id);
    if (session) {
      return { session, isNew: false };
    }
  }

  return { session: store.create(), isNew: true };
}

export async function createAssistantRuntime(
  options: CliOptions,
  callbacks?: {
    onStatus?: (message: string) => void;
    onWarning?: (message: string) => void;
  }
): Promise<AssistantRuntime> {
  const paths = resolveRuntimePaths(options);
  const sessionStore = new FileSessionStore(paths.dataPaths.sessions);
  const resolved = await resolveSession(options, sessionStore);
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH?.trim() || undefined;

  const controller = await AssistantController.create(
    resolved.session.messages,
    sessionStore,
    resolved.session.id,
    {
      vaultPath,
      dataPaths: paths.dataPaths,
      knowledgeSourceDir: paths.knowledgeSourceDir,
    }
  );

  let vaultWatcher: VaultWatcher | null = null;
  if (vaultPath) {
    try {
      const knowledgeStore = controller.getKnowledgeStore();
      callbacks?.onStatus?.(`Syncing Obsidian vault: ${vaultPath}`);
      const syncStats = await knowledgeStore.syncVault(vaultPath);
      callbacks?.onStatus?.(
        `Vault sync complete: ${syncStats.added} added, ${syncStats.updated} updated, ${syncStats.removed} removed`
      );

      vaultWatcher = new VaultWatcher({
        vaultPath,
        store: knowledgeStore,
      });
      vaultWatcher.start();
      callbacks?.onStatus?.("Watching vault for changes");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      callbacks?.onWarning?.(`Failed to set up vault watching: ${message}`);
    }
  }

  return {
    ...paths,
    session: resolved.session,
    isNewSession: resolved.isNew,
    controller,
    vaultWatcher,
    async stop(): Promise<void> {
      if (vaultWatcher) {
        await vaultWatcher.stop();
      }
    },
  };
}
