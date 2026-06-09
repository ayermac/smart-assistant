import { describe, expect, it } from "vitest";
import { formatLogRows, formatLogText, normalizeLogText } from "../tui-format.js";

describe("TUI log formatting", () => {
  it("normalizes assistant markdown and local knowledge citations", () => {
    const text = "According to `Projects/求职准备/面试准备.md > GMP模型深度解析`：\n1. **架构层面**：G/M/P 三层解耦";

    expect(normalizeLogText("assistant", text)).toBe(
      "来源：Projects/求职准备/面试准备.md > GMP模型深度解析：\n1. 架构层面：G/M/P 三层解耦"
    );
  });

  it("wraps numbered list continuation lines with indentation", () => {
    const rows = formatLogText(
      "assistant",
      "1. 架构层面：通过G、M、P三层解耦减少全局锁竞争，提高调度效率。",
      24
    );

    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0]).toMatch(/^1\. /);
    expect(rows[1]).toMatch(/^   /);
  });

  it("renders a prefix only on the first visual row of a log entry", () => {
    const rows = formatLogRows(
      [
        {
          id: 1,
          kind: "assistant",
          text: "这是一段比较长的回答，用来验证换行之后不会重复显示 assistant 前缀。",
        },
      ],
      20
    );

    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0].prefix).toBe("assistant>");
    expect(rows.slice(1).every((row) => row.prefix === "")).toBe(true);
  });
});
