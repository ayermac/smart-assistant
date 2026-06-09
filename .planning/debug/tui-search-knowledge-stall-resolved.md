# Debug: TUI search_knowledge Stall

## Symptom

During an Ink TUI session, the user asked a Go GMP question. The assistant emitted:

- `tool> search_knowledge started`
- input area changed to `assistant is responding`

The UI then appeared stuck with no further progress.

## Root Cause

- `search_knowledge` did not enforce a tool-level timeout.
- The tool received an `AbortSignal`, but the signal was not propagated into knowledge search, ingestion, embedding, or rerank network calls.
- `AssistantController` ignored `tool_execution_update`, so existing tool progress updates were not shown in CLI/TUI.
- Embedding and Cohere rerank fetch calls had no request timeout.

## Fix

- Added `tool_update` assistant events and rendered them in CLI/TUI.
- Added `SMART_ASSISTANT_KNOWLEDGE_TIMEOUT_MS` / `SMART_ASSISTANT_TOOL_TIMEOUT_MS` handling for `search_knowledge`.
- Added active timeout racing in `search_knowledge`, so even non-cooperative store calls return a timeout result.
- Propagated abort signals into knowledge search, ingestion, text embedding, multimodal embedding, and rerank calls.
- Added embedding fetch timeout via `EMBEDDING_TIMEOUT_MS` / `SMART_ASSISTANT_EMBEDDING_TIMEOUT_MS`.
- Added tests for embedding abort signal propagation and `search_knowledge` timeout behavior.

## Verification

- `npm run typecheck` passed.
- `npm test` passed: 9 files, 63 tests.

## User Guidance

If the TUI shows `assistant is responding` during a long tool call, press Ctrl+C to abort the active response. After this fix, `search_knowledge` should also show progress updates and fail with a timeout instead of waiting indefinitely.
