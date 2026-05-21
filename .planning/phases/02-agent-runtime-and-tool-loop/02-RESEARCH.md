# Research: Phase 2 - Agent Runtime and Tool Loop

**Research Date:** 2026-05-21
**Phase Goal:** Connect CLI messages to a single assistant agent loop using `pi-agent-core` and `pi-ai`, with streaming output and first local tool calls.

## Executive Summary

Phase 2 requires wiring three key components:
1. **`pi-ai`** - Model/provider abstraction for LLM calls
2. **`pi-agent-core`** - Agent loop, message state, tool calling, event streaming
3. **CLI Integration** - Wire agent events to stdout with streaming output

The `pi` monorepo provides a complete reference implementation in `coding-agent` that demonstrates all required patterns. The integration is straightforward: create an `Agent` instance, subscribe to events, and call `prompt()`.

---

## 1. pi-ai Package - Model Calls

### Package Location
```
../pi/packages/ai/
```

### Import Paths and API Surface

```typescript
// Main entry point
import {
  // Model registry
  getModel,
  getProviders,
  getModels,
  calculateCost,

  // Streaming functions
  streamSimple,
  completeSimple,
  stream,
  complete,

  // Types
  type Model,
  type Context,
  type Message,
  type UserMessage,
  type AssistantMessage,
  type ToolResultMessage,
  type Tool,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
```

### Key Types

**Model Selection:**
```typescript
// Get a model by provider and ID
const model = getModel("anthropic", "claude-sonnet-4-20250514");

// Model has all necessary metadata
interface Model<TApi> {
  id: string;           // "claude-sonnet-4-20250514"
  name: string;
  api: Api;             // "anthropic-messages", "openai-completions", etc.
  provider: Provider;   // "anthropic", "openai", etc.
  baseUrl: string;
  reasoning: boolean;   // Supports thinking/reasoning
  cost: { input, output, cacheRead, cacheWrite };
  contextWindow: number;
  maxTokens: number;
}
```

**Context for LLM Calls:**
```typescript
interface Context {
  systemPrompt?: string;
  messages: Message[];
  tools?: Tool[];
}
```

### Streaming Support

```typescript
import { streamSimple, type Context, type Model } from "@earendil-works/pi-ai";

const context: Context = {
  systemPrompt: "You are a helpful assistant.",
  messages: [{ role: "user", content: "Hello!", timestamp: Date.now() }],
};

const stream = streamSimple(model, context, {
  apiKey: process.env.ANTHROPIC_API_KEY,
});

for await (const event of stream) {
  switch (event.type) {
    case "text_delta":
      process.stdout.write(event.delta);
      break;
    case "done":
      console.log("\nComplete!");
      break;
  }
}

// Get final message
const finalMessage = await stream.result();
```

### Provider Configuration

**Built-in Providers (auto-registered):**
- `anthropic-messages` - Anthropic Claude API
- `openai-completions` - OpenAI chat completions
- `openai-responses` - OpenAI Responses API
- `google-generative-ai` - Google Gemini
- `mistral-conversations` - Mistral AI
- `bedrock-converse-stream` - AWS Bedrock

**API Keys via Environment:**
```typescript
import { getEnvApiKey } from "@earendil-works/pi-ai";

// Resolves from ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.
const apiKey = getEnvApiKey(model.provider);
```

### Error Handling Patterns

The stream contract states:
- **Must not throw** for request/model/runtime failures
- Failures are encoded in the stream via `error` event
- Final message has `stopReason: "error"` or `"aborted"`

```typescript
for await (const event of stream) {
  if (event.type === "error") {
    console.error("LLM error:", event.error.errorMessage);
    // event.error is still an AssistantMessage
  }
}
```

---

## 2. pi-agent-core Package - Agent Loop

### Package Location
```
../pi/packages/agent/
```

### Import Paths and API Surface

```typescript
// Main entry point
import {
  // Core Agent class (recommended for most use cases)
  Agent,
  type AgentOptions,
  type AgentState,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
  type AgentToolResult,
  type ThinkingLevel,

  // Low-level loop functions (for advanced use)
  agentLoop,
  agentLoopContinue,
  type AgentContext,
  type AgentLoopConfig,
} from "@earendil-works/pi-agent-core";
```

### Agent Class - Primary API

The `Agent` class is the recommended way to use pi-agent-core:

```typescript
import { Agent, type AgentEvent } from "@earendil-works/pi-agent-core";
import { getModel, streamSimple } from "@earendil-works/pi-ai";

const agent = new Agent({
  initialState: {
    systemPrompt: "You are a helpful assistant.",
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
    thinkingLevel: "off",
    tools: [],  // Will add tools in Phase 2
    messages: [],
  },
  // Optional: custom stream function (defaults to streamSimple)
  streamFn: streamSimple,
});

// Subscribe to events BEFORE calling prompt
agent.subscribe((event: AgentEvent) => {
  // Handle streaming output
  if (event.type === "message_update") {
    const msgEvent = event.assistantMessageEvent;
    if (msgEvent.type === "text_delta") {
      process.stdout.write(msgEvent.delta);
    }
  }
});

// Send a prompt
await agent.prompt("Hello, assistant!");
```

### Agent Events

| Event | Description | Key Fields |
|-------|-------------|------------|
| `agent_start` | Agent begins processing | - |
| `agent_end` | Processing complete | `messages: AgentMessage[]` |
| `turn_start` | New turn begins | - |
| `turn_end` | Turn complete | `message`, `toolResults` |
| `message_start` | Message begins | `message: AgentMessage` |
| `message_update` | Streaming update | `message`, `assistantMessageEvent` |
| `message_end` | Message complete | `message: AgentMessage` |
| `tool_execution_start` | Tool begins | `toolCallId`, `toolName`, `args` |
| `tool_execution_end` | Tool complete | `toolCallId`, `result`, `isError` |

### Message Flow

```
AgentMessage[] → transformContext() → AgentMessage[] → convertToLlm() → Message[] → LLM
                  (optional)                           (required)
```

1. **transformContext**: Prune old messages, inject external context (optional)
2. **convertToLlm**: Filter out UI-only messages, convert custom types (default provided)

### Event Stream Pattern

```typescript
// The agent uses EventStream for async iteration
import { EventStream } from "@earendil-works/pi-ai";

// Stream pattern from agent-loop.ts
const stream = agentLoop(prompts, context, config);
for await (const event of stream) {
  // Process events
}
const messages = await stream.result();  // Final messages array
```

---

## 3. Integration Patterns

### How pi-ai and pi-agent-core Work Together

```typescript
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel, streamSimple } from "@earendil-works/pi-ai";

// 1. Agent wraps the LLM call with tool execution loop
// 2. Agent calls streamSimple internally (or custom streamFn)
// 3. Agent handles message accumulation, tool calling, event emission

const agent = new Agent({
  initialState: {
    systemPrompt: "You are a helpful assistant.",
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
    tools: [/* ... */],
    messages: [],
  },
  streamFn: streamSimple,  // Default, but explicit for clarity
});
```

### Tool Registry Pattern

Tools are registered directly on the Agent:

```typescript
import { Type } from "typebox";
import { type AgentTool, type AgentToolResult } from "@earendil-works/pi-agent-core";

// Define a simple tool
const get_time: AgentTool = {
  name: "get_time",
  description: "Get the current time",
  label: "Get Time",
  parameters: Type.Object({
    timezone: Type.Optional(Type.String({
      description: "IANA timezone, e.g., 'America/New_York'"
    })),
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    const tz = params.timezone || "UTC";
    const now = new Date();
    const timeStr = now.toLocaleString("en-US", { timeZone: tz });
    
    return {
      content: [{ type: "text", text: timeStr }],
      details: { timezone: tz, timestamp: now.toISOString() },
    };
  },
};

// Register tool
const agent = new Agent({
  initialState: {
    // ...
    tools: [get_time],
  },
});
```

### Streaming Output Handling

```typescript
agent.subscribe((event) => {
  switch (event.type) {
    case "message_start":
      if (event.message.role === "assistant") {
        process.stdout.write("assistant> ");
      }
      break;

    case "message_update":
      // Only for assistant messages
      const msgEvent = event.assistantMessageEvent;
      switch (msgEvent.type) {
        case "text_delta":
          process.stdout.write(msgEvent.delta);
          break;
        case "toolcall_start":
          console.log(`\n[Calling tool: ${msgEvent.partial.content[msgEvent.contentIndex].name}]`);
          break;
      }
      break;

    case "message_end":
      if (event.message.role === "assistant") {
        process.stdout.write("\n");
      }
      break;

    case "tool_execution_start":
      console.log(`  Executing: ${event.toolName}(${JSON.stringify(event.args)})`);
      break;

    case "tool_execution_end":
      if (event.isError) {
        console.log(`  Tool error: ${JSON.stringify(event.result.content)}`);
      }
      break;
  }
});
```

---

## 4. CLI Integration

### Current CLI State

The current `src/cli.ts` has:
- Argument parsing (--help, --version, --data-dir)
- Interactive readline loop
- Placeholder response: "Agent runtime is not connected yet..."

### Integration Strategy

**Replace the placeholder with Agent runtime:**

```typescript
import { Agent, type AgentEvent } from "@earendil-works/pi-agent-core";
import { getModel, streamSimple } from "@earendil-works/pi-ai";

async function runInteractive(options: CliOptions): Promise<void> {
  // Initialize agent
  const agent = new Agent({
    initialState: {
      systemPrompt: "You are a helpful local assistant.",
      model: getModel("anthropic", "claude-sonnet-4-20250514"),
      tools: [/* get_time tool */],
      messages: [],
    },
  });

  // Subscribe to events
  agent.subscribe((event) => handleAgentEvent(event));

  const rl = createInterface({ input: stdin, output: stdout });
  
  while (true) {
    const input = await rl.question("you> ");
    const message = input.trim();
    
    if (message === "" || message === "/exit") break;
    if (message === "/help") { /* show help */ continue; }

    // Send to agent
    await agent.prompt(message);
  }
  
  rl.close();
}

function handleAgentEvent(event: AgentEvent): void {
  // Stream text, show tool calls, handle errors
}
```

### Error Handling

```typescript
agent.subscribe((event) => {
  if (event.type === "message_end" && event.message.role === "assistant") {
    if (event.message.errorMessage) {
      console.error(`Error: ${event.message.errorMessage}`);
    }
  }
});
```

### Graceful Shutdown

```typescript
// Agent has abort support
process.on("SIGINT", () => {
  agent.abort();  // Abort current run
  process.exit(0);
});
```

---

## 5. Tool Implementation

### Tool Contract

```typescript
interface AgentTool<TParameters = TSchema, TDetails = any> {
  name: string;                    // Tool name (unique identifier)
  description: string;             // Description for model
  label: string;                   // Human-readable label for UI
  parameters: TSchema;             // TypeBox schema for parameters
  prepareArguments?: (args: unknown) => Static<TParameters>;  // Optional shim
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: (partialResult: AgentToolResult<TDetails>) => void,
  ) => Promise<AgentToolResult<TDetails>>;
  executionMode?: "sequential" | "parallel";  // Per-tool override
}
```

### get_time Tool Example

```typescript
import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";

export const get_time: AgentTool = {
  name: "get_time",
  description: "Get the current date and time. Optionally specify a timezone.",
  label: "Get Current Time",
  parameters: Type.Object({
    timezone: Type.Optional(Type.String({
      description: "IANA timezone identifier (e.g., 'America/New_York', 'Europe/London'). Defaults to UTC.",
    })),
  }),
  execute: async (toolCallId, params) => {
    const tz = params.timezone ?? "UTC";
    const now = new Date();
    
    try {
      const timeStr = now.toLocaleString("en-US", { 
        timeZone: tz,
        dateStyle: "full",
        timeStyle: "long",
      });
      
      return {
        content: [{ type: "text", text: `Current time in ${tz}: ${timeStr}` }],
        details: { timezone: tz, iso: now.toISOString() },
      };
    } catch (error) {
      // Invalid timezone
      return {
        content: [{ 
          type: "text", 
          text: `Invalid timezone '${tz}'. Use IANA timezone identifiers like 'America/New_York'.` 
        }],
        details: { error: true, timezone: tz },
      };
    }
  },
};
```

### Local Tools vs External Tools

For v1, all tools are **local** (Phase 2 requirement TLS-03):
- No cloud services beyond model-provider calls
- Tools execute in Node.js runtime
- Direct filesystem/memory access

---

## 6. Key Dependencies

### Package.json Updates Needed

```json
{
  "dependencies": {
    "@earendil-works/pi-ai": "^0.75.4",
    "@earendil-works/pi-agent-core": "^0.75.4",
    "typebox": "^1.1.38"
  }
}
```

### Environment Variables

```bash
# Required for model calls
ANTHROPIC_API_KEY=sk-ant-...
# or
OPENAI_API_KEY=sk-...
```

---

## 7. Reference Implementations

### pi-coding-agent (Best Reference)

Location: `../pi/packages/coding-agent/`

Key files:
- `src/main.ts` - CLI entry point, shows full integration
- `src/core/sdk.ts` - `createAgentSession()` factory
- `src/core/tools/index.ts` - Tool registry patterns
- `src/core/tools/bash.ts` - Complex tool example

### Agent README

Location: `../pi/packages/agent/README.md`

Complete documentation of:
- Agent class API
- Event flow diagrams
- Tool execution modes
- Message types

---

## 8. Implementation Order for Phase 2

Based on the roadmap plans:

### Plan 02-01: Inspect Integration Points
- Add `@earendil-works/pi-ai` and `@earendil-works/pi-agent-core` dependencies
- Verify import paths and basic compilation
- Test model registry access with `getModel()`

### Plan 02-02: Implement Assistant Controller
- Create `src/assistant/` module
- Initialize `Agent` instance with system prompt
- Wire basic `prompt()` call with placeholder response
- Verify streaming events reach CLI

### Plan 02-03: Implement Tool Registry
- Create `src/tools/` module
- Implement `get_time` tool
- Register tool with Agent
- Test tool calling via prompt

### Plan 02-04: Add Streaming and Error Handling
- Stream text deltas to stdout
- Show tool execution status
- Handle errors gracefully
- Add abort signal handling

---

## 9. Open Questions for Planning

1. **Model Selection**: Should the CLI support model selection at startup, or hardcode a default?
   - Recommendation: Start with hardcoded default, add `--model` flag later

2. **API Key Management**: How to handle missing API keys?
   - Recommendation: Clear error message pointing to env var setup

3. **System Prompt**: What should the default system prompt be?
   - Recommendation: Start simple, refine based on evaluation (Phase 7)

4. **Tool Error Display**: How to present tool errors to users?
   - Recommendation: Show in stderr with clear formatting

---

## 10. Key Insights

1. **Agent class is the primary API** - No need to use low-level `agentLoop()` directly
2. **Subscribe before prompt** - Events are only emitted during the run
3. **Tool execution is automatic** - Agent handles tool calling loop
4. **Error handling is encoded** - Not thrown, but in `errorMessage` field
5. **TypeBox schemas** - Required for tool parameter validation
6. **Event stream is async iterable** - Can use `for await...of` pattern

---

## Summary

Phase 2 implementation is straightforward using the `Agent` class from `pi-agent-core`:

```typescript
// Minimal working integration
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";

const agent = new Agent({
  initialState: {
    systemPrompt: "You are a helpful assistant.",
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
    tools: [get_time],
    messages: [],
  },
});

agent.subscribe(handleEvents);
await agent.prompt("What time is it?");
```

The main work is:
1. Adding dependencies
2. Creating the `get_time` tool
3. Wiring events to CLI output
4. Proper error handling and shutdown
