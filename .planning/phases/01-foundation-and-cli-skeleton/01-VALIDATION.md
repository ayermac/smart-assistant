---
phase: 1
slug: foundation-and-cli-skeleton
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-21
---

# Phase 1 — Validation Strategy

Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | npm scripts plus Node/rg smoke checks |
| Config file | `tsconfig.json` created by Plan 01-01 |
| Quick run command | `npm run typecheck` |
| Full suite command | `npm run build && node dist/cli.js --help && node dist/cli.js --version` |
| Estimated runtime | ~10 seconds after dependencies are installed |

## Sampling Rate

- After every task commit: run the task-level `<verify>` command from the active PLAN.
- After every plan wave: run `npm run typecheck` once dependencies exist.
- Before `$gsd-verify-work`: run `npm run build && node dist/cli.js --help && node dist/cli.js --version`.
- Max feedback latency: 30 seconds after dependencies are installed.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01-01 | 1 | FND-01 | T-01-02 / T-01-03 | Package scripts and Node engine are explicit | file/assertion | `node -e "const p=require('./package.json'); if(!p.scripts.typecheck) process.exit(1)"` | package.json | pending |
| 01-01-02 | 01-01 | 1 | FND-01 | T-01-03 | TypeScript config targets Node ESM | file/assertion | `node -e "JSON.parse(require('fs').readFileSync('tsconfig.json','utf8'))"` | tsconfig.json | pending |
| 01-01-03 | 01-01 | 1 | FND-01 | T-01-01 | Local generated data is ignored | grep | `rg "SMART_ASSISTANT_DATA_DIR|DEFAULT_DATA_DIR" src/config.ts` | src/config.ts | pending |
| 01-02-01 | 01-02 | 2 | FND-02 | T-01-04 / T-01-06 | CLI flags work without provider calls | grep/smoke | `rg "--help|--version|--data-dir|Unknown option" src/cli.ts` | src/cli.ts | pending |
| 01-02-02 | 01-02 | 2 | FND-02 | T-01-04 / T-01-05 | Prompt handles input as text only | grep/smoke | `rg "Agent runtime is not connected yet|/exit|/help" src/cli.ts` | src/cli.ts | pending |
| 01-02-03 | 01-02 | 2 | FND-02 | T-01-06 | CLI entry is exported and catches failures | grep | `rg "pathToFileURL|process.exitCode = 1" src/cli.ts` | src/cli.ts | pending |
| 01-03-01 | 01-03 | 3 | FND-03 | T-01-07 | Env example contains no secrets | grep | `rg "SMART_ASSISTANT_DATA_DIR=.smart-assistant|SMART_ASSISTANT_PROVIDER=|SMART_ASSISTANT_MODEL=" .env.example` | .env.example | pending |
| 01-03-02 | 01-03 | 3 | FND-03 | T-01-08 | README states Phase 1 placeholder behavior | grep | `rg "## Phase 1 Behavior|pi-agent-core|pi-ai" README.md` | README.md | pending |
| 01-03-03 | 01-03 | 3 | FND-04 | T-01-09 | Planning links stay consolidated | node | `node -e "const fs=require('fs'); const stale='docs' + '/'; for (const p of ['README.md','.planning/PROJECT.md','.planning/REQUIREMENTS.md','.planning/ROADMAP.md','.planning/STATE.md','.planning/research/SUMMARY.md']) if (fs.readFileSync(p,'utf8').includes(stale)) process.exit(1)"` | README.md | pending |

## Wave 0 Requirements

No separate test framework is required for Phase 1. Command-based validation is sufficient because Phase 1 creates a CLI scaffold and does not yet implement agent logic.

If execution chooses to add a test framework early, use `vitest` and add `npm run test` as a non-blocking enhancement; do not make it a Phase 1 requirement.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Interactive prompt exits cleanly | FND-02 | Requires stdin interaction | Run `npm run dev`, type `/help`, type `/exit`, and confirm the process exits without stack traces |

## Validation Sign-Off

- [x] All tasks have automated or command-based verify steps.
- [x] Sampling continuity: every plan includes task-level verification.
- [x] No watch-mode flags are required.
- [x] Feedback latency is under 30 seconds after dependencies are installed.

**Approval:** pending execution
