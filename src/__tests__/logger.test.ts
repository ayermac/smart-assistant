import { describe, expect, it } from "vitest";
import { createLogger, parseLogLevel, timeAsync } from "../logger.js";

describe("logger", () => {
  it("parses known log levels and defaults unknown values to info", () => {
    expect(parseLogLevel("debug")).toBe("debug");
    expect(parseLogLevel("WARN")).toBe("warn");
    expect(parseLogLevel("nope")).toBe("info");
    expect(parseLogLevel(undefined)).toBe("info");
  });

  it("filters messages below the configured level", () => {
    const lines: string[] = [];
    const logger = createLogger("test", {
      level: "warn",
      sink: (line) => lines.push(line),
    });

    logger.info("hidden");
    logger.warn("visible", { count: 2 });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("warn test visible");
    expect(lines[0]).toContain("count=2");
  });

  it("records duration for successful timed tasks", async () => {
    const lines: string[] = [];
    const logger = createLogger("timing", {
      level: "debug",
      sink: (line) => lines.push(line),
    });
    const times = [100, 137];

    const result = await timeAsync(
      logger,
      "debug",
      "stage",
      async () => "ok",
      { items: 3 },
      () => times.shift() ?? 137
    );

    expect(result).toBe("ok");
    expect(lines[0]).toContain("debug timing stage");
    expect(lines[0]).toContain("items=3");
    expect(lines[0]).toContain("durationMs=37");
  });

  it("logs and rethrows timed task errors", async () => {
    const lines: string[] = [];
    const logger = createLogger("timing", {
      level: "error",
      sink: (line) => lines.push(line),
    });

    await expect(
      timeAsync(logger, "debug", "stage", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(lines[0]).toContain("error timing stage failed");
    expect(lines[0]).toContain("boom");
  });
});
