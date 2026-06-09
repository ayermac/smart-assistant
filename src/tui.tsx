#!/usr/bin/env node

import { config } from "dotenv";
config({ quiet: true });

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, render, useApp, useInput, useWindowSize } from "ink";
import { SMART_ASSISTANT_DATA_DIR_ENV } from "./config.js";
import type { AssistantEvent } from "./assistant/index.js";
import {
  buildUsage,
  createAssistantRuntime,
  isDirectExecution,
  parseArgs,
  readPackageVersion,
  type AssistantRuntime,
  type CliOptions,
} from "./runtime.js";

type LogKind = "system" | "user" | "assistant" | "tool" | "error";

interface LogLine {
  id: number;
  kind: LogKind;
  text: string;
}

function lineColor(kind: LogKind): string {
  switch (kind) {
    case "system":
      return "gray";
    case "user":
      return "green";
    case "assistant":
      return "white";
    case "tool":
      return "cyan";
    case "error":
      return "red";
  }
}

function linePrefix(kind: LogKind): string {
  switch (kind) {
    case "system":
      return "system";
    case "user":
      return "you";
    case "assistant":
      return "assistant";
    case "tool":
      return "tool";
    case "error":
      return "error";
  }
}

function App({ options }: { options: CliOptions }) {
  const { exit } = useApp();
  const { rows } = useWindowSize();
  const [runtime, setRuntime] = useState<AssistantRuntime | null>(null);
  const runtimeRef = useRef<AssistantRuntime | null>(null);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [input, setInput] = useState("");
  const [isPromptInProgress, setIsPromptInProgress] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const nextLineId = useRef(1);
  const activeAssistantLineId = useRef<number | null>(null);
  const isPromptInProgressRef = useRef(false);
  const isExitingRef = useRef(false);

  const appendLine = useCallback((kind: LogKind, text: string): number => {
    const id = nextLineId.current++;
    setLines((current) => [...current, { id, kind, text }]);
    return id;
  }, []);

  const updateLine = useCallback((id: number, appendText: string): void => {
    setLines((current) =>
      current.map((line) =>
        line.id === id
          ? { ...line, text: `${line.text}${appendText}` }
          : line
      )
    );
  }, []);

  const stopAndExit = useCallback(async (): Promise<void> => {
    if (isExitingRef.current) {
      return;
    }

    isExitingRef.current = true;
    await runtimeRef.current?.stop();
    exit();
    process.exit(0);
  }, [exit]);

  useEffect(() => {
    isPromptInProgressRef.current = isPromptInProgress;
  }, [isPromptInProgress]);

  const handleInterrupt = useCallback((): void => {
    if (isPromptInProgressRef.current) {
      runtimeRef.current?.controller.abort();
      appendLine("system", "Aborted");
      isPromptInProgressRef.current = false;
      setIsPromptInProgress(false);
      return;
    }

    void stopAndExit();
  }, [appendLine, stopAndExit]);

  useEffect(() => {
    process.on("SIGINT", handleInterrupt);
    return () => {
      process.off("SIGINT", handleInterrupt);
    };
  }, [handleInterrupt]);

  useEffect(() => {
    let isMounted = true;

    createAssistantRuntime(options, {
      onStatus: (message) => appendLine("system", message),
      onWarning: (message) => appendLine("error", message),
    })
      .then((createdRuntime) => {
        if (!isMounted) {
          void createdRuntime.stop();
          return;
        }

        runtimeRef.current = createdRuntime;
        setRuntime(createdRuntime);
        setIsInitializing(false);
        appendLine("system", `Data dir: ${createdRuntime.dataDir}`);
        appendLine(
          "system",
          createdRuntime.isNewSession
            ? `New session: ${createdRuntime.session.id}`
            : `Resumed session: ${createdRuntime.session.id} (${createdRuntime.session.messages.length} messages)`
        );
        appendLine("system", `Set ${SMART_ASSISTANT_DATA_DIR_ENV} or pass --data-dir to change it.`);
        appendLine("system", "Type /help for commands. Press Ctrl+C to abort or exit.");
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (isMounted) {
          appendLine("error", message);
          setIsInitializing(false);
        }
      });

    return () => {
      isMounted = false;
      void runtimeRef.current?.stop();
    };
  }, [appendLine, options]);

  const handleAssistantEvent = useCallback((event: AssistantEvent): void => {
    switch (event.type) {
      case "text_delta": {
        if (!event.delta) {
          return;
        }

        if (activeAssistantLineId.current === null) {
          activeAssistantLineId.current = appendLine("assistant", "");
        }

        updateLine(activeAssistantLineId.current, event.delta);
        break;
      }

      case "tool_start":
        appendLine("tool", `${event.toolName} started`);
        break;

      case "tool_update":
        appendLine("tool", `${event.toolName}: ${event.message}`);
        break;

      case "tool_end":
        appendLine("tool", `${event.toolName} ${event.isError ? "failed" : "done"}`);
        break;

      case "error":
        appendLine("error", event.message);
        break;
    }
  }, [appendLine, updateLine]);

  const submit = useCallback(async (rawInput?: string): Promise<void> => {
    const message = (rawInput ?? input).trim();

    if (message === "" || message === "/exit") {
      setInput("");
      await stopAndExit();
      return;
    }

    if (message === "/help") {
      setInput("");
      appendLine("system", "Commands: /help, /exit. Ctrl+C aborts an active response or exits when idle.");
      return;
    }

    if (!runtime) {
      appendLine("error", "Assistant is still initializing.");
      return;
    }

    setInput("");
    appendLine("user", message);
    setIsPromptInProgress(true);
    activeAssistantLineId.current = null;

    try {
      await runtime.controller.prompt(message, handleAssistantEvent);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      appendLine("error", errorMessage);
    } finally {
      activeAssistantLineId.current = null;
      setIsPromptInProgress(false);
    }
  }, [appendLine, handleAssistantEvent, input, runtime, stopAndExit]);

  useInput((value, key) => {
    if (key.ctrl && value === "c") {
      handleInterrupt();
      return;
    }

    if (isPromptInProgress) {
      return;
    }

    if (key.return || value.includes("\n") || value.includes("\r")) {
      const inlineInput = value.replace(/[\r\n]/g, "");
      void submit(inlineInput ? `${input}${inlineInput}` : undefined);
      return;
    }

    if (key.backspace || key.delete) {
      setInput((current) => current.slice(0, -1));
      return;
    }

    if (key.escape) {
      setInput("");
      return;
    }

    if (!key.ctrl && value) {
      setInput((current) => `${current}${value.replace(/\r?\n/g, "")}`);
    }
  });

  const maxLogLines = Math.max(8, rows - 7);
  const visibleLines = lines.slice(-maxLogLines);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box borderStyle="single" paddingX={1}>
        <Text color="cyan">smart-assistant TUI</Text>
        <Text color="gray">  Ink terminal interface</Text>
      </Box>

      <Box flexDirection="column" minHeight={maxLogLines}>
        {visibleLines.map((line) => (
          <Box key={line.id}>
            <Text color={lineColor(line.kind)}>{linePrefix(line.kind)}&gt; </Text>
            <Text color={lineColor(line.kind)}>{line.text}</Text>
          </Box>
        ))}
        {isInitializing ? (
          <Text color="yellow">Initializing assistant...</Text>
        ) : null}
      </Box>

      <Box borderStyle="single" paddingX={1}>
        <Text color={isPromptInProgress ? "yellow" : "green"}>
          {isPromptInProgress ? "assistant is responding" : "you> "}
        </Text>
        {!isPromptInProgress ? <Text>{input}</Text> : null}
        {!isPromptInProgress ? <Text inverse> </Text> : null}
      </Box>
    </Box>
  );
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.kind === "help") {
    process.stdout.write(`${buildUsage("smart-assistant-tui")}\n`);
    return;
  }

  if (parsed.kind === "version") {
    process.stdout.write(`${await readPackageVersion()}\n`);
    return;
  }

  if (parsed.kind === "error") {
    console.error(parsed.message);
    process.exitCode = 1;
    return;
  }

  render(<App options={parsed.options} />);
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
