export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

export type LogMeta = Record<string, string | number | boolean | undefined | null>;

export interface LoggerOptions {
  level?: LogLevel;
  sink?: (line: string) => void;
  now?: () => number;
}

export interface Logger {
  readonly scope: string;
  readonly level: LogLevel;
  isEnabled(level: Exclude<LogLevel, "silent">): boolean;
  error(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  debug(message: string, meta?: LogMeta): void;
}

const LOG_LEVEL_ENV = "SMART_ASSISTANT_LOG_LEVEL";

const levelPriority: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export function parseLogLevel(value: string | undefined): LogLevel {
  switch (value?.trim().toLowerCase()) {
    case "silent":
    case "error":
    case "warn":
    case "info":
    case "debug":
      return value.trim().toLowerCase() as LogLevel;
    default:
      return "info";
  }
}

function defaultSink(line: string): void {
  console.error(line);
}

function formatMeta(meta?: LogMeta): string {
  if (!meta) {
    return "";
  }

  const entries = Object.entries(meta)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`);

  return entries.length > 0 ? ` ${entries.join(" ")}` : "";
}

export function createLogger(scope: string, options?: LoggerOptions): Logger {
  const level = options?.level ?? parseLogLevel(process.env[LOG_LEVEL_ENV]);
  const sink = options?.sink ?? defaultSink;

  const write = (messageLevel: Exclude<LogLevel, "silent">, message: string, meta?: LogMeta) => {
    if (levelPriority[level] < levelPriority[messageLevel]) {
      return;
    }

    sink(`[smart-assistant] ${messageLevel} ${scope} ${message}${formatMeta(meta)}`);
  };

  return {
    scope,
    level,
    isEnabled(messageLevel) {
      return levelPriority[level] >= levelPriority[messageLevel];
    },
    error(message, meta) {
      write("error", message, meta);
    },
    warn(message, meta) {
      write("warn", message, meta);
    },
    info(message, meta) {
      write("info", message, meta);
    },
    debug(message, meta) {
      write("debug", message, meta);
    },
  };
}

export async function timeAsync<T>(
  logger: Logger,
  level: Exclude<LogLevel, "silent">,
  message: string,
  task: () => Promise<T>,
  meta?: LogMeta,
  now: () => number = () => performance.now()
): Promise<T> {
  const start = now();

  try {
    const result = await task();
    const durationMs = Math.round(now() - start);
    if (logger.isEnabled(level)) {
      logger[level](message, { ...meta, durationMs });
    }
    return result;
  } catch (error) {
    const durationMs = Math.round(now() - start);
    logger.error(`${message} failed`, {
      ...meta,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
