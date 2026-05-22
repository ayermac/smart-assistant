# Phase 4 Discussion Log

**Phase:** 4 - Long-term Memory
**Date:** 2026-05-22

---

## Gray Areas Discussed

### 1. Storage Backend

**Question:** JSON files vs SQLite for memory storage?

**Options presented:**
- JSON files (recommended) — Consistent with session storage, simple, no dependencies
- SQLite — Better query performance, but adds complexity

**User selection:** JSON files (recommended)

**Rationale:** Consistent with Phase 3 session storage pattern, no additional dependencies, can migrate to SQLite later if needed.

---

### 2. Retrieval Strategy

**Question:** Keyword matching vs semantic search?

**Options presented:**
- Keyword matching (recommended) — Substring match + tag filtering, simple, no external APIs
- Semantic search — Better accuracy, but requires embedding API

**User selection:** Keyword matching (recommended)

**Rationale:** Sufficient for v1 memory volume, no external dependencies, can upgrade to semantic search in v2.

---

### 3. Memory vs Session Boundary

**Question:** How to ensure memories are explicit only?

**Options presented:**
- Tool-only constraint (recommended) — `remember` tool + system prompt + directory separation
- User confirmation mechanism — Require confirmation before each memory save

**User selection:** Tool-only constraint (recommended)

**Rationale:** MEM-04 requires no automatic storage. Tool-based approach makes action intentional. System prompt enforces the rule.

---

### 4. Memory Schema

**Question:** Minimal vs extended schema?

**Options presented:**
- Minimal schema (recommended) — id, text, tags, createdAt, updatedAt
- Extended schema — Add category, importance, source fields

**User selection:** Minimal schema (recommended)

**Rationale:** Satisfies MEM-02 exactly, no over-engineering for v1, tags provide enough flexibility.

---

## Decisions Captured

| Area | Decision |
|------|----------|
| Storage backend | JSON files in `{dataDir}/memories/` |
| Retrieval strategy | Keyword substring + tag filtering |
| Memory boundary | Tool-only constraint with system prompt |
| Schema | Minimal: id, text, tags[], createdAt, updatedAt |

---

## Deferred Ideas

None — all discussions stayed within phase scope.

---

*Discussion completed: 2026-05-22*
