# Phase 21 Context: Operability and RAG Stability

## Background

The project now has a usable local assistant with:

- readline CLI and Ink TUI
- local session persistence
- long-term memory
- LanceDB-backed hybrid RAG
- Obsidian vault sync and file watching
- PDF/DOCX/image-aware knowledge ingestion
- production bin entrypoints

Recent fixes stabilized startup sync, LanceDB schema migration, TUI input/exit, production binary execution, `search_knowledge` timeouts, and transcript formatting.

## Problem

The next risks are operational rather than feature breadth:

- It is hard to diagnose slow RAG behavior without per-stage timing.
- `VectorKnowledgeStore` can be touched by startup sync, watcher events, and user-triggered searches.
- Scripts under `scripts/` are not typechecked with the main build, so API drift can go unnoticed.
- Logging is spread across `console.log`, `console.warn`, and `console.error`, which makes debug output noisy and inconsistent.

## Current Evidence

- `tsconfig.json` includes only `src/**/*.ts` and `src/**/*.tsx`.
- `VaultWatcher` directly calls `indexFile`, `reindexFile`, and `removeFile`.
- `search_knowledge` can trigger `needsReindex`, `ingest`, and `search`.
- `VectorKnowledgeStore` maintains mutable state: LanceDB table handle, manifest cache, BM25 cache, and rebuild flags.
- Existing tests cover many unit-level paths, but fewer end-to-end runtime flows.

## Scope

This phase should harden the system before adding larger product features.

In scope:

- RAG and tool timing instrumentation
- Structured local logger
- Knowledge-store write serialization
- Script typechecking
- Minimal end-to-end RAG regression test with mocked embedding
- Documentation for diagnostics and verification

Out of scope:

- New UI surfaces beyond small TUI status improvements
- New RAG ranking algorithms
- Cloud sync
- Multi-user or server deployment
- Full observability backend integration

## Success Definition

After this phase, a developer should be able to answer:

- Which RAG stage is slow?
- Was the index being written while a search was requested?
- Are project scripts still type-compatible with source APIs?
- Can a clean local test prove indexing plus search works end to end?
