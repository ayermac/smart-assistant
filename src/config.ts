export const DEFAULT_DATA_DIR = ".smart-assistant";
export const DEFAULT_SMART_ASSISTANT_PROVIDER = "openai";
export const DEFAULT_SMART_ASSISTANT_MODEL = "doubao-seed-2.0-lite";

export const SMART_ASSISTANT_DATA_DIR_ENV = "SMART_ASSISTANT_DATA_DIR";
export const SMART_ASSISTANT_PROVIDER_ENV = "SMART_ASSISTANT_PROVIDER";
export const SMART_ASSISTANT_MODEL_ENV = "SMART_ASSISTANT_MODEL";
export const SMART_ASSISTANT_KNOWLEDGE_DIR_ENV = "SMART_ASSISTANT_KNOWLEDGE_DIR";

export const DATA_SUBDIRS = {
  sessions: "sessions",
  memory: "memory",
  knowledge: "knowledge",
  plans: "plans",
  vectors: "vectors",
} as const;

export type DataSubdirName = keyof typeof DATA_SUBDIRS;
export type DataPaths = Record<DataSubdirName, string>;

export function resolveDataDir(env: NodeJS.ProcessEnv = process.env): string {
  return env[SMART_ASSISTANT_DATA_DIR_ENV]?.trim() || DEFAULT_DATA_DIR;
}

export function resolveDataPaths(env: NodeJS.ProcessEnv = process.env): DataPaths {
  const dataDir = resolveDataDir(env);
  return {
    sessions: `${dataDir}/${DATA_SUBDIRS.sessions}`,
    memory: `${dataDir}/${DATA_SUBDIRS.memory}`,
    knowledge: `${dataDir}/${DATA_SUBDIRS.knowledge}`,
    plans: `${dataDir}/${DATA_SUBDIRS.plans}`,
    vectors: `${dataDir}/${DATA_SUBDIRS.vectors}`,
  };
}

/**
 * Resolve the knowledge source directory path.
 * Checks SMART_ASSISTANT_KNOWLEDGE_DIR env var, falling back to {dataDir}/knowledge-sources.
 */
export function resolveKnowledgeSourceDir(env: NodeJS.ProcessEnv = process.env): string {
  const knowledgeDir = env[SMART_ASSISTANT_KNOWLEDGE_DIR_ENV]?.trim();
  if (knowledgeDir) {
    return knowledgeDir;
  }
  const dataDir = resolveDataDir(env);
  return `${dataDir}/knowledge-sources`;
}
