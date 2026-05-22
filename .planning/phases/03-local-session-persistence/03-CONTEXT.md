# Phase 3 CONTEXT: Local Session Persistence

**Phase:** 3
**Created:** 2026-05-22
**Status:** Decisions locked

---

## Phase Goal

Persist assistant sessions locally and restore enough context to continue a previous conversation.

## Requirements

- **SES-01**: Assistant persists session messages and minimal session metadata locally.
- **SES-02**: User can resume a previous session by session id or latest-session default.
- **SES-03**: Restored sessions include enough context for the assistant to continue coherently.

## Success Criteria

1. User can start a session and the assistant stores messages locally.
2. User can resume the latest session or a named session id.
3. Restored session includes prior relevant messages in the next assistant turn.

---

## Locked Decisions

### 1. Storage Backend: JSON Files

**Decision:** Each session is stored as a single JSON file in the sessions directory.

**Rationale:**
- v1 session volume is expected to be low
- JSON is simple, readable, and easy to debug
- No additional dependencies required
- SQLite can be introduced later for Phase 4/5/6 if memory/knowledge/plans need it

**File location:** `{dataDir}/sessions/session-{timestamp}.json`

**Implementation notes:**
- Use `src/config.ts` `DATA_SUBDIRS.sessions` for directory path
- Ensure directory exists before writing
- Use atomic write pattern (write to temp file, then rename) to avoid corruption

---

### 2. Message Storage Format: Complete Message Objects

**Decision:** Store complete `pi-agent-core` Message objects directly.

**Rationale:**
- No need for serialization/deserialization logic
- Full context preservation including tool calls and results
- Simplicity over flexibility for v1

**Schema:**

```typescript
interface SessionFile {
  id: string;              // Timestamp-based ID
  createdAt: string;       // ISO timestamp
  updatedAt: string;       // ISO timestamp
  messages: Message[];     // pi-agent-core Message[]
}
```

**Implementation notes:**
- Import `Message` type from `@earendil-works/pi-agent-core`
- Store messages array as-is from Agent state
- Update `updatedAt` on each message append

---

### 3. Session ID Format: Timestamp-based

**Decision:** Session IDs are ISO 8601 timestamps with colons replaced by hyphens.

**Format:** `YYYY-MM-DDTHH-MM-SS` (e.g., `2026-05-22T00-30-00`)

**Rationale:**
- Human-readable and sortable
- Easy to identify the latest session by lexicographic sort
- No need for UUID generation

**File naming:** `session-{timestamp}.json`

**Implementation notes:**
- Use `new Date().toISOString().replace(/:/g, "-")` for ID generation
- Parse timestamp from filename when listing sessions

---

### 4. Context Recovery Strategy: Full Load

**Decision:** Restore all messages from the session file into Agent state.

**Rationale:**
- v1 sessions are not expected to be long enough to hit context limits
- Simplicity first; token budget strategies can be added for EVAL-09
- Preserves complete conversation context

**Implementation notes:**
- Pass `messages` array directly to Agent's `initialState.messages`
- No truncation or summarization in v1

---

### 5. CLI Resume Entry: Default Latest + Parameter Override

**Decision:**
- No CLI argument: Resume latest session (by timestamp sort)
- `--session <id>`: Resume specific session
- `--new`: Start a new session (don't resume)

**Rationale:**
- Meets SES-02 requirement for both "latest-session default" and "named session id"
- Minimal CLI surface for v1
- User can always inspect session files manually if needed

**CLI changes:**

```bash
# Resume latest session
smart-assistant

# Resume specific session
smart-assistant --session 2026-05-22T00-30-00

# Start new session
smart-assistant --new
```

**Implementation notes:**
- Add argument parsing in `src/cli.ts`
- List session files, sort by filename (timestamp), pick last
- If no sessions exist, start new session automatically

---

## Implementation Contracts

### SessionStore Interface

```typescript
interface SessionStore {
  // Create a new session with current timestamp
  create(): SessionFile;

  // Load a session by ID
  load(sessionId: string): SessionFile | null;

  // Save messages to an existing session
  save(sessionId: string, messages: Message[]): void;

  // List all sessions sorted by timestamp (newest first)
  list(): SessionMeta[];

  // Get the latest session (or null if none exist)
  getLatest(): SessionMeta | null;
}

interface SessionMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}
```

### Agent Integration

- `AssistantController` needs to accept initial messages for session restore
- After each agent turn, messages should be persisted to session file
- Consider debouncing or throttling saves to avoid excessive I/O

---

## Out of Scope for Phase 3

- Token budget management (deferred to evaluation phase)
- Session deletion/cleanup
- Session metadata editing (rename, tags)
- Multi-turn context summarization
- Cross-session search

---

## Dependencies

- `@earendil-works/pi-agent-core` (Message type)
- Node.js `fs` module for file operations
- `path` module for path resolution

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/session/store.ts` | Create | SessionStore implementation |
| `src/session/types.ts` | Create | SessionFile, SessionMeta, SessionStore interfaces |
| `src/assistant/controller.ts` | Modify | Accept initial messages, persist after turns |
| `src/cli.ts` | Modify | Add --session, --new arguments; resume logic |

---

## Traceability

| Requirement | Decision | Implementation |
|-------------|----------|----------------|
| SES-01 | JSON file storage, complete messages | `src/session/store.ts` |
| SES-02 | Timestamp ID, default latest + --session flag | `src/cli.ts`, `store.ts` |
| SES-03 | Full load strategy | `AssistantController` initialization |

---

*CONTEXT created: 2026-05-22*
*Ready for research and planning*
