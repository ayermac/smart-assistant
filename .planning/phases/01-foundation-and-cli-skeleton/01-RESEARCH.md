# Phase 1: Foundation and CLI Skeleton - Research

## Goal

Plan the smallest TypeScript foundation that can later host a `pi-agent-core` + `pi-ai` personal knowledge assistant, without implementing the full agent loop in Phase 1.

## Inputs Read

- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/research/SUMMARY.md`
- `../pi/package.json`
- `../pi/packages/ai/package.json`
- `../pi/packages/agent/package.json`
- `../pi/packages/coding-agent/package.json`
- `../pi/tsconfig.base.json`

## Technical Findings

- The reference `pi` workspace is ESM-first with `"type": "module"`.
- `pi` requires Node `>=22.19.0`; `smart-assistant` should use the same engine floor to avoid subtle runtime drift.
- `pi` uses TypeScript 5.9.x and `tsx` for running TypeScript during development.
- `pi-ai` and `pi-agent-core` package names are `@earendil-works/pi-ai` and `@earendil-works/pi-agent-core`.
- Phase 1 should not depend on the remote packages yet unless installation is explicitly part of the scaffold; Phase 2 owns concrete integration.
- A local CLI skeleton can be implemented with Node built-ins only: `node:readline/promises`, `node:process`, `node:path`, `node:fs/promises`.

## Recommended Phase 1 Shape

Create a minimal application skeleton:

- `package.json`
  - `"type": "module"`
  - `"bin": { "smart-assistant": "./dist/cli.js" }`
  - scripts:
    - `"dev": "tsx src/cli.ts"`
    - `"build": "tsc -p tsconfig.json"`
    - `"typecheck": "tsc -p tsconfig.json --noEmit"`
    - `"start": "node dist/cli.js"`
- `tsconfig.json`
  - target modern Node/ESM
  - `rootDir: "src"`
  - `outDir: "dist"`
  - strict type checking
- `src/cli.ts`
  - executable shebang
  - parse `--help`, `--version`, optional `--data-dir`
  - start a minimal interactive prompt
  - print a deterministic placeholder assistant response
- `src/config.ts`
  - local data directory resolution
  - env var names and defaults
- `src/index.ts`
  - export future public entry points
- `.env.example`
  - document `SMART_ASSISTANT_DATA_DIR`, `SMART_ASSISTANT_PROVIDER`, `SMART_ASSISTANT_MODEL`
- `.gitignore`
  - ignore `dist/`, `node_modules/`, `.env`, `.smart-assistant/`

## Validation Architecture

Phase 1 can be verified without external network or model credentials:

- `npm run typecheck` exits 0 after dependencies are installed.
- `npm run build` creates `dist/cli.js`.
- `node dist/cli.js --help` prints usage containing `smart-assistant`.
- `node dist/cli.js --version` prints the `package.json` version.
- `README.md` contains local setup commands and data directory details.

## Risks and Mitigations

- **Dependency install may require network**: keep Phase 1 package dependencies minimal (`tsx`, `typescript`, `@types/node`) and document install separately if lockfile cannot be generated.
- **Over-implementing agent runtime early**: keep Phase 1 CLI response as a placeholder; Phase 2 owns `pi-ai` and `pi-agent-core`.
- **Data path ambiguity**: define one default local data path and one env override in Phase 1.

## Planner Notes

Split into 3 plans matching roadmap:

1. package/TypeScript/source layout
2. CLI startup behavior
3. README/env/data directory documentation

The plans should be sequential because CLI implementation depends on the package/source layout, and documentation should describe the files/scripts that exist after plans 1 and 2.
