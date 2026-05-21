export const DEFAULT_DATA_DIR = ".smart-assistant";

export const SMART_ASSISTANT_DATA_DIR_ENV = "SMART_ASSISTANT_DATA_DIR";
export const SMART_ASSISTANT_PROVIDER_ENV = "SMART_ASSISTANT_PROVIDER";
export const SMART_ASSISTANT_MODEL_ENV = "SMART_ASSISTANT_MODEL";

export const DATA_SUBDIRS = {
  sessions: "sessions",
  memory: "memory",
  knowledge: "knowledge",
  plans: "plans",
} as const;

export type DataSubdirName = keyof typeof DATA_SUBDIRS;

export function resolveDataDir(env: NodeJS.ProcessEnv = process.env): string {
  return env[SMART_ASSISTANT_DATA_DIR_ENV]?.trim() || DEFAULT_DATA_DIR;
}

export function resolveDataPaths(env: NodeJS.ProcessEnv = process.env): Record<DataSubdirName, string> {
  const dataDir = resolveDataDir(env);
  return {
    sessions: `${dataDir}/${DATA_SUBDIRS.sessions}`,
    memory: `${dataDir}/${DATA_SUBDIRS.memory}`,
    knowledge: `${dataDir}/${DATA_SUBDIRS.knowledge}`,
    plans: `${dataDir}/${DATA_SUBDIRS.plans}`,
  };
}
