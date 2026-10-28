# ai-sync

Git-backed sync tool for AI tool configurations (Claude Code, OpenCode) across machines.

## Commands

```bash
npm run build          # Build with tsup → dist/
npm test               # Run Vitest tests
npm run test:coverage  # Tests with coverage
npm run lint           # Biome lint
npm run format         # Biome format
npm run typecheck      # tsc --noEmit
```

## Development safety

NEVER run a dev/unbuilt build against your real config. `push`/`pull` mutate the
sync repo and config dir. When testing manually, always target throwaway dirs:

```bash
node dist/cli.js push --repo-path /tmp/test-repo --claude-dir /tmp/test-claude
```

Set `AI_SYNC_DEV=1` in your dev shell to enforce this: with it set, `push`/`pull`
refuse to operate on the real default sync repo (`~/.ai-sync`) and require an
explicit `--repo-path` to a throwaway directory. Tests are sandboxed: `tests/setup.ts`
points `HOME`/`USERPROFILE` at a temp dir (and clears `XDG_CONFIG_HOME`/`CODEX_HOME`)
before any test loads, and aborts the run if that fails.

### CLI surface

```bash
ai-sync init | push | pull [--auto-apply] | status [--verbose] [--summarize]
ai-sync bootstrap <repo-url> | update | install-skills | env | migrate
ai-sync resolve list | diff <path> | accept <path|--all> | reject <path|--all>
```

AI-assisted merge is configured via `tools/merge-config.json` in the sync repo
(see `docs/merge-config.md`). It is enabled by default; set `"enabled": false`
to opt out.

## Architecture

- `src/cli/` — Commander.js CLI entry point and commands
- `src/core/` — Sync engine, manifest (allowlist), path rewriter, backups, environments
- `src/core/merge/` — AI-assisted 3-way merge (config, adapters, strategies, staging, orchestrator)
- `src/git/` — Git wrapper (simple-git)
- `src/platform/` — Cross-platform path resolution
- `tests/` — Mirrors src/ structure, uses Vitest + memfs
- `skills/` — Slash command definitions (`.claude.md` / `.opencode.md`)
- `tools/merge-config.json` (in the sync repo, not this repo) — AI-merge config; schema in `src/core/merge/config.ts`

## Conventions

- ESM only (`"type": "module"`), Node.js 22+, TypeScript strict mode
- Node built-ins use `node:` prefix: `import * as fs from "node:fs"`
- Biome for formatting/linting: tabs, 100 char line width
- Commands export `registerXCommand(program)` + `handleX(options)` pattern
- Async/await throughout; errors caught in handlers with `process.exitCode = 1`
- Terminal output via picocolors (green=success, red=error, yellow=warn, cyan=info)
- Tests use `describe`/`it`/`expect` with memfs for filesystem mocking
- Git operations use explicit file paths, never `git add .`
- Allowlist-based sync: only files in `DEFAULT_SYNC_TARGETS` / `PLUGIN_SYNC_PATTERNS` are synced
- Path rewriting: absolute paths ↔ `{{HOME}}` tokens for cross-platform portability

## Versioning & changelog

Semver ([2.0.0](https://semver.org/spec/v2.0.0.html)); `package.json` is the single source
of the version (the CLI reads it for `--version`).

- Every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md`
  (Keep a Changelog sections: Added / Changed / Deprecated / Removed / Fixed / Security),
  in the same PR as the change. Pure refactors, tests, and CI tweaks may skip it.
- Bump on release, by the largest change in `[Unreleased]`:
  - **MAJOR** — breaking: sync-repo format change needing `migrate`, removed/renamed
    command or flag, or a sync-target change that drops files users rely on.
  - **MINOR** — new command/flag/environment, or a backward-compatible behavior change
    (including adding or removing a sync target).
  - **PATCH** — bug fixes, dependency bumps, docs.
  - While on 0.x, breaking changes may ship as MINOR but must be called out in the entry.
- Release steps: rename `[Unreleased]` to `[X.Y.Z] - YYYY-MM-DD` and add a fresh empty
  `[Unreleased]`; set the version with `npm version X.Y.Z --no-git-tag-version` (updates
  `package-lock.json` too); update the compare links at the bottom of the changelog;
  commit as `chore(release): vX.Y.Z`; tag `vX.Y.Z` (three parts only — no `v0.2.3.1`).

## Workflow

- Always use autospec for multi-step feature work: `/autospec-define` to brainstorm and decompose into linked GitHub issues, then `/autospec-run` for autonomous implementation with auto-merge.
- For an existing tracked design spec, use `/autospec-split` then `/autospec-run`.
- Single-task or bug-fix work that doesn't warrant a full spec can use `/turboplan` or `/implement` directly.
