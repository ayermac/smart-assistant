export type LogKind = "system" | "user" | "assistant" | "tool" | "error";

export interface LogLine {
  id: number;
  kind: LogKind;
  text: string;
}

export interface DisplayLogRow {
  key: string;
  kind: LogKind;
  prefix: string;
  text: string;
}

export const LOG_PREFIX_WIDTH = 12;

export function linePrefix(kind: LogKind): string {
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

function normalizeAssistantText(text: string): string {
  return text
    .replace(/According to `([^`]+)`\s*[:：]/gi, "来源：$1：")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeLogText(kind: LogKind, text: string): string {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  return kind === "assistant" ? normalizeAssistantText(normalized) : normalized.trim();
}

function charWidth(char: string): number {
  const codePoint = char.codePointAt(0) ?? 0;

  if (codePoint === 0 || codePoint < 32 || (codePoint >= 0x7f && codePoint < 0xa0)) {
    return 0;
  }

  if (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6))
  ) {
    return 2;
  }

  return 1;
}

function displayWidth(text: string): number {
  return Array.from(text).reduce((width, char) => width + charWidth(char), 0);
}

function continuationIndentFor(line: string): string {
  const match = line.match(/^(\s*(?:[-*]|\d+[.)])\s+)/);
  if (!match) {
    return "";
  }

  return " ".repeat(displayWidth(match[1]));
}

function wrapLine(line: string, width: number): string[] {
  if (line === "") {
    return [""];
  }

  const targetWidth = Math.max(16, width);
  const continuationIndent = continuationIndentFor(line);
  const rows: string[] = [];
  let current = "";
  let currentWidth = 0;

  for (const char of Array.from(line)) {
    const widthToAdd = charWidth(char);
    if (current && currentWidth + widthToAdd > targetWidth) {
      rows.push(current.trimEnd());
      current = continuationIndent;
      currentWidth = displayWidth(continuationIndent);
    }

    current += char;
    currentWidth += widthToAdd;
  }

  rows.push(current.trimEnd());
  return rows;
}

export function formatLogText(kind: LogKind, text: string, width: number): string[] {
  const normalized = normalizeLogText(kind, text);
  if (!normalized) {
    return [""];
  }

  return normalized
    .split("\n")
    .flatMap((line) => wrapLine(line.trimEnd(), width));
}

export function formatLogRows(lines: LogLine[], width: number): DisplayLogRow[] {
  return lines.flatMap((line) => {
    const rows = formatLogText(line.kind, line.text, width);
    const prefix = `${linePrefix(line.kind)}>`;

    return rows.map((text, index) => ({
      key: `${line.id}-${index}`,
      kind: line.kind,
      prefix: index === 0 ? prefix : "",
      text,
    }));
  });
}
