# Phase 13 Context: Ink Terminal UI

## User Request

Use GSD to plan and then implement an Ink-based TypeScript TUI for smart-assistant. Planning artifacts must live under `.planning`; no standalone docs directory should be created.

## Product Goal

Add a Claude Code-like terminal interface while preserving the existing plain readline CLI. The TUI should provide a richer full-screen local interaction surface for the existing assistant runtime.

## Relevant Existing Architecture

- `src/cli.ts` owns the current readline interaction loop and CLI argument parsing.
- `AssistantController.create()` constructs the agent, memory, knowledge, and planning tools.
- `AssistantController.prompt()` streams `AssistantEvent` values:
  - `text_delta`
  - `tool_start`
  - `tool_end`
  - `error`
- Session persistence and data directory resolution are already separated from the terminal loop.

## Constraints

- Keep the existing CLI behavior and `smart-assistant` binary stable.
- Add the TUI as an optional entry point, not as a replacement.
- Keep planning and implementation records in `.planning`.
- Use TypeScript ecosystem tooling; avoid Python/Gradio for this path.
- Do not require model access during automated tests.

## Dependency Decision

Use Ink with React:

- `ink` for terminal rendering and input handling.
- `react` as Ink's component model runtime.

## Acceptance Criteria

1. `npm run tui` starts an Ink-based terminal UI.
2. `smart-assistant-tui` binary is available after build.
3. The TUI supports `--data-dir`, `--session`, and `--new` options matching the CLI.
4. User input streams assistant output through the existing `AssistantController`.
5. Tool start/end and error events are visible in the TUI.
6. Existing `npm run dev`, `npm run build`, `npm run typecheck`, and `npm test` still pass.

