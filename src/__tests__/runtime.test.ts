import { describe, expect, it } from "vitest";
import { buildUsage, parseArgs, resolveRuntimePaths } from "../runtime.js";

describe("runtime argument parsing", () => {
  it("parses run options", () => {
    expect(parseArgs(["--data-dir", "/tmp/sa", "--session", "abc"])).toEqual({
      kind: "run",
      options: {
        dataDir: "/tmp/sa",
        sessionId: "abc",
      },
    });
  });

  it("rejects --session with --new", () => {
    expect(parseArgs(["--session", "abc", "--new"])).toEqual({
      kind: "error",
      message: "Cannot use --session and --new together",
    });
  });

  it("formats usage for different binaries", () => {
    expect(buildUsage("smart-assistant-tui")).toContain("smart-assistant-tui [--data-dir <path>]");
  });
});

describe("runtime path resolution", () => {
  it("threads --data-dir into all local paths", () => {
    const paths = resolveRuntimePaths(
      { dataDir: "/tmp/smart-assistant-test" },
      {}
    );

    expect(paths.dataDir).toBe("/tmp/smart-assistant-test");
    expect(paths.dataPaths.sessions).toBe("/tmp/smart-assistant-test/sessions");
    expect(paths.dataPaths.vectors).toBe("/tmp/smart-assistant-test/vectors");
    expect(paths.knowledgeSourceDir).toBe("/tmp/smart-assistant-test/knowledge-sources");
  });
});
