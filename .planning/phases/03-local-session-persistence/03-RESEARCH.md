# Phase 3 RESEARCH: Local Session Persistence

**Phase:** 3
**Created:** 2026-05-22
**Status:** Research complete

---

## Summary

This document captures technical findings needed to plan Phase 3: Local Session Persistence. The research covers the `pi-agent-core` message types, filesystem patterns, CLI argument parsing, and integration points with the existing codebase.

---

## 1. Technical Findings

### 1.1 Message Types from pi-agent-core

The `AgentMessage` type from `pi-agent-core` is a union of LLM messages:

```typescript
// From @earendil-works/pi-agent-core/dist/types.d.ts
type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];

// From @earendil-works/pi-ai/dist/types.d.ts
type Message = UserMessage | AssistantMessage | ToolResultMessage;

interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}

interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: Api;
  provider: Provider;
  model: string;
  responseModel?: string;
  responseId?: string;
  diagnostics?: AssistantMessageDiagnostic[];
  usage: Usage;
  stopReason: StopReason;
  errorMessage?: string;
  timestamp: number;
}

interface ToolResultMessage<TDetails = any> {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: TDetails;
  isError: boolean;
  timestamp: number;
}
```

**Key Insight:** All `Message` types are plain objects that serialize to JSON without transformation. The `timestamp` is a number (Unix epoch ms), not a Date object.

### 1.2 Agent State Access

The `Agent` class exposes state via the `state` accessor:

```typescript
interface AgentState {
  systemPrompt: string;
  model: Model<any>;
  thinkingLevel: ThinkingLevel;
  tools: AgentTool<any>[];          // Setter copies array
  messages: AgentMessage[];          // Setter copies array
  readonly isStreaming: boolean;
  readonly streamingMessage?: AgentMessage;
  readonly pendingToolCalls: ReadonlySet<string>;
  readonly errorMessage?: string;
}
```

**Key Insight:** `state.messages` returns the current message array. Setting `state.messages` copies the array before storing.

### 1.3 Agent Constructor with Initial State

The `Agent` accepts initial messages via `AgentOptions`:

```typescript
interface AgentOptions {
  initialState?: Partial<Omit<AgentState, "pendingToolCalls" | "isStreaming" | "streamingMessage" | "errorMessage">>;
  // ... other options
}

// Usage:
const agent = new Agent({
  initialState: {
    systemPrompt: SYSTEM_PROMPT,
    model: getDefaultModel(),
    thinkingLevel: "off",
    tools: ALL_TOOLS,
    messages: loadedMessages,  // <-- Can pass restored messages here
  },
});
```

**Key Insight:** We can restore a session by passing `messages` in `initialState`. No modification to the Agent class is needed.

### 1.4 Agent Events for Persistence Triggers

The `Agent` emits events we can subscribe to:

```typescript
type AgentEvent = 
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }  // <-- Contains all messages
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean }
  // ... more events
```

**Key Insight:** The `agent_end` event includes the complete `messages` array, making it the ideal trigger for session persistence.

### 1.5 Existing Session Support in pi-agent-core

The library includes a sophisticated session system (`JsonlSessionRepo`, `Session` class) with:
- JSONL-based storage for append-only entries
- Branch navigation and tree structure
- Compaction and summarization hooks

**Decision:** For Phase 3, we will NOT use these. They are over-engineered for our v1 requirements:
- Our sessions are simple linear conversations
- We don't need branching, forking, or compaction yet
- A simple JSON file per session is sufficient per CONTEXT.md decision

---

## 2. Filesystem Patterns

### 2.1 Directory Structure

```typescript
// From src/config.ts
export const DATA_SUBDIRS = {
  sessions: "sessions",
  memory: "memory",
  knowledge: "knowledge",
  plans: "plans",
} as const;

export function resolveDataPaths(env: NodeJS.ProcessEnv): Record<DataSubdirName, string> {
  const dataDir = resolveDataDir(env);
  return {
    sessions: `${dataDir}/${DATA_SUBDIRS.sessions}`,
    // ...
  };
}
```

**Implementation Note:** The data directory (default `.smart-assistant`) doesn't exist yet. The `SessionStore` must create `sessions/` subdirectory on first write.

### 2.2 Atomic Write Pattern

```typescript
import { writeFile, rename, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  // Ensure directory exists
  await mkdir(dirname(filePath), { recursive: true });
  
  // Write to temp file first
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  
  // Atomic rename (POSIX guarantees atomicity)
  await rename(tempPath, filePath);
}
```

**Rationale:** This pattern prevents corruption from partial writes if the process crashes mid-write.

### 2.3 Session File Naming

Per CONTEXT.md decision:

```typescript
function generateSessionId(): string {
  // Format: YYYY-MM-DDTHH-MM-SS
  return new Date().toISOString().replace(/:/g, "-").slice(0, 19);
}

function getSessionFilePath(sessionsDir: string, sessionId: string): string {
  return join(sessionsDir, `session-${sessionId}.json`);
}
```

---

## 3. CLI Argument Parsing

### 3.1 Current CLI Structure

The CLI in `src/cli.ts` uses a simple `parseArgs` function:

```typescript
type CliOptions = {
  dataDir?: string;
};

function parseArgs(argv: string[]): { kind: "run"; options: CliOptions } | { kind: "help" } | { kind: "version" } | { kind: "error"; message: string }
```

### 3.2 Required Changes

Add `--session <id>` and `--new` flags:

```typescript
type CliOptions = {
  dataDir?: string;
  sessionId?: string;  // Resume specific session
  newSession?: boolean; // Start fresh, don't resume
};

function parseArgs(argv: string[]): ParsedArgs {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--session") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        return { kind: "error", message: "Missing value for --session" };
      }
      options.sessionId = value;
      index += 1;
      continue;
    }

    if (arg === "--new") {
      options.newSession = true;
      continue;
    }

    // ... existing options
  }

  return { kind: "run", options };
}
```

### 3.3 Resume Logic Flow

```typescript
async function resolveSession(options: CliOptions, store: SessionStore): Promise<SessionFile> {
  // 1. Explicit --session <id>
  if (options.sessionId) {
    const session = store.load(options.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${options.sessionId}`);
    }
    return session;
  }

  // 2. --new flag
  if (options.newSession) {
    return store.create();
  }

  // 3. Default: resume latest or create new
  const latest = store.getLatest();
  if (latest) {
    return store.load(latest.id);
  }
  return store.create();
}
```

---

## 4. AssistantController Integration

### 4.1 Current Implementation

```typescript
export class AssistantController {
  private readonly agent: Agent;

  constructor() {
    this.agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model: getDefaultModel(),
        thinkingLevel: "off",
        tools: ALL_TOOLS,
        messages: [],
      },
    });
  }

  async prompt(message: string, onEvent: (event: AssistantEvent) => void): Promise<void> {
    // ...
  }
}
```

### 4.2 Required Changes

```typescript
export class AssistantController {
  private readonly agent: Agent;
  private readonly sessionStore: SessionStore;
  private readonly sessionId: string;

  constructor(initialMessages: AgentMessage[], sessionStore: SessionStore, sessionId: string) {
    this.sessionStore = sessionStore;
    this.sessionId = sessionId;
    
    this.agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model: getDefaultModel(),
        thinkingLevel: "off",
        tools: ALL_TOOLS,
        messages: initialMessages,  // <-- Restored messages
      },
    });

    // Subscribe to agent_end for persistence
    this.agent.subscribe((event) => {
      if (event.type === "agent_end") {
        this.sessionStore.save(this.sessionId, event.messages);
      }
    });
  }

  // Add getter for current messages (for explicit save on exit)
  getMessages(): AgentMessage[] {
    return [...this.agent.state.messages];
  }
}
```

### 4.3 Persistence Timing

**Recommendation:** Save after each assistant turn (not after every `prompt()` call):

1. Subscribe to `agent_end` event
2. Save messages to session file
3. Use atomic write pattern

Alternative: Also save on graceful exit (Ctrl+D, `/exit` command) to ensure final state is persisted.

---

## 5. SessionStore Interface

Per CONTEXT.md contract:

```typescript
// src/session/types.ts

import type { AgentMessage } from "@earendil-works/pi-agent-core";

export interface SessionFile {
  id: string;              // Timestamp-based ID: YYYY-MM-DDTHH-MM-SS
  createdAt: string;       // ISO timestamp
  updatedAt: string;       // ISO timestamp
  messages: AgentMessage[];
}

export interface SessionMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface SessionStore {
  create(): SessionFile;
  load(sessionId: string): SessionFile | null;
  save(sessionId: string, messages: AgentMessage[]): void;
  list(): SessionMeta[];
  getLatest(): SessionMeta | null;
}
```

---

## 6. Implementation Approach

### 6.1 File Creation Order

1. `src/session/types.ts` - Interfaces
2. `src/session/store.ts` - SessionStore implementation
3. `src/assistant/controller.ts` - Modify constructor and add persistence
4. `src/cli.ts` - Add --session and --new flags, integrate SessionStore

### 6.2 Test Strategy

1. **Unit tests for SessionStore:**
   - Create new session
   - Load existing session
   - Save messages
   - List sessions (empty, multiple)
   - Get latest (none, multiple)

2. **Integration tests:**
   - CLI starts with new session
   - CLI resumes latest session
   - CLI resumes specific session
   - Messages persist across restart

3. **Manual verification:**
   - Inspect JSON files in `.smart-assistant/sessions/`
   - Verify atomic write (no temp files left)

---

## 7. Potential Challenges

### 7.1 Message Array Growth

**Issue:** Sessions could grow large over time.

**Mitigation:** Defer to evaluation phase (EVAL-09). CONTEXT.md specifies "full load, no truncation in v1".

### 7.2 Concurrent Access

**Issue:** Multiple CLI instances accessing same session.

**Mitigation:** Out of scope for v1. Single-user, single-process assumption.

### 7.3 Data Directory Creation

**Issue:** `.smart-assistant/sessions/` doesn't exist on fresh install.

**Mitigation:** `SessionStore.create()` calls `mkdir(path, { recursive: true })` before first write.

### 7.4 Agent Subscription Memory

**Issue:** Subscribing to agent events inside `prompt()` causes duplicate subscriptions.

**Current code:**
```typescript
async prompt(message: string, onEvent: (event: AssistantEvent) => void): Promise<void> {
  // Subscribe to agent events before calling prompt
  this.agent.subscribe((event: AgentEvent) => {
    this.handleAgentEvent(event, onEvent);
  });
  // ...
}
```

**Problem:** Each `prompt()` call adds a new subscriber. Memory leak and duplicate event handling.

**Solution:** Subscribe once in constructor, store unsubscribe function, or use event emitter pattern. For Phase 3, move subscription to constructor and route events through a shared handler.

---

## 8. Code Patterns to Follow

### 8.1 Error Handling

Follow existing pattern in `controller.ts`:
- Throw errors for validation failures
- Use `onEvent({ type: "error", message })` for runtime errors
- Never swallow errors silently

### 8.2 Type Imports

```typescript
// Import from the public API
import type { AgentMessage } from "@earendil-works/pi-agent-core";
```

### 8.3 File Organization

Follow `src/` structure:
- `src/session/` directory for session-related modules
- Re-export from `src/session/index.ts`
- Keep modules focused (< 400 lines each)

### 8.4 Immutable Patterns

```typescript
// Clone messages when storing
save(sessionId: string, messages: AgentMessage[]): void {
  const session = this.sessions.get(sessionId);
  if (session) {
    session.messages = [...messages];  // Copy array
    session.updatedAt = new Date().toISOString();
  }
}
```

---

## 9. Out of Scope Reminders

- Token budget management (deferred)
- Session deletion/cleanup
- Session metadata editing
- Multi-turn context summarization
- Cross-session search
- Using pi-agent-core's built-in Session/JsonlSessionRepo (too complex for v1)

---

## 10. Next Steps

1. Create implementation plan with task breakdown
2. Implement SessionStore with unit tests
3. Modify AssistantController for persistence
4. Update CLI with new flags
5. Integration testing
6. Manual verification

---

*RESEARCH completed: 2026-05-22*
*Ready for planning phase*
