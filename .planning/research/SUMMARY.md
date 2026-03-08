# Project Research Summary

**Project:** Claude Config Sync
**Domain:** Cross-platform dotfile/config synchronization CLI tool
**Researched:** 2026-03-08
**Confidence:** HIGH

## Executive Summary

Claude Config Sync is a Git-backed CLI tool that automatically synchronizes the `~/.claude` directory across macOS, Linux, and Windows/WSL workstations. The established approach for this domain is a "source of truth + apply" pattern: a dedicated Git repository stores the canonical config, and each machine reconciles against it. This is how chezmoi (the market leader for general dotfiles) works, and it is the right architecture for this use case. The tool differentiates from generic dotfile managers by being purpose-built for `~/.claude` -- shipping opinionated defaults about what to sync (agents, commands, hooks, settings, CLAUDE.md) versus what to ignore (1.6+ GB of ephemeral session data, telemetry, and debug logs). It differentiates from existing Claude-specific tools (claude-brain, CCMS) by offering fully automatic background sync via file watching rather than manual commands or session hooks.

The recommended stack is Node.js 22 LTS + TypeScript 5.9 + Commander.js for the CLI, simple-git for Git operations, and chokidar v4 for file watching. All dependencies are mature, actively maintained, and well-typed. The architecture separates into five layers: CLI commands, sync engine (scanner + differ + resolver), Git operations, file watcher/daemon, and platform abstractions. This layering means the first deliverable milestone (manual push/pull) requires only the first three layers, and automatic sync can be layered on top without rearchitecting.

The three highest-risk pitfalls are: (1) accidentally syncing machine-local state (projects/, debug/, telemetry/ totaling 1.6+ GB) into Git, which is irreversible and poisons the repo; (2) hardcoded absolute paths in settings.json that break when synced to a machine with a different username or OS; and (3) Git merge conflicts during unattended auto-sync with no human to resolve them. All three must be addressed in Phase 1 design decisions -- they are not deferrable. The mitigation strategy is: allowlist-based file selection (not blocklist), path token rewriting at sync time, and last-writer-wins with automatic backup on conflict.

## Key Findings

### Recommended Stack

The stack is built around Node.js 22 LTS as the runtime (already present on target machines for Claude Code) and TypeScript 5.9 for type safety. Commander.js 14 provides the CLI framework -- lightweight and appropriate for a 4-5 command tool. simple-git wraps the native git CLI with a typed promise-based API, and chokidar v4 normalizes cross-platform file watching (native `fs.watch` has known crash bugs on Linux). See STACK.md for full details.

**Core technologies:**
- **Node.js 22 LTS**: Runtime -- already a dependency of Claude Code, native ESM, maintenance until April 2027
- **TypeScript 5.9**: Type safety -- strong typing for config schemas and git operation wrappers
- **Commander.js 14**: CLI framework -- lightweight, excellent TypeScript types, CJS+ESM dual support
- **simple-git 3.32**: Git operations -- promise-based API, wraps native git, handles all required operations
- **chokidar 4**: File watching -- cross-platform normalization, handles editor temp files and atomic writes
- **zod 4**: Config validation -- TypeScript-first schema validation for settings and sync config
- **Biome 2**: Linter + formatter -- single tool replacing ESLint + Prettier, 10-25x faster
- **vitest 4**: Test runner -- native TypeScript support, fast execution, excellent watch mode
- **tsup 8**: Bundler -- stable, battle-tested CJS+ESM bundling (tsdown is pre-1.0, not ready)

### Expected Features

**Must have (table stakes):**
- Git-backed version control as sync transport
- Cross-platform support (macOS, Linux, WSL) from day one
- Selective file sync via manifest with Claude-aware defaults
- One-command setup on new machines (`claude-sync init <repo-url>`)
- Push/pull commands for explicit sync
- Status command showing sync state
- Backup before pull as safety net
- Init from existing `~/.claude` (most users already have a populated directory)

**Should have (differentiators):**
- Automatic background sync via file watcher daemon -- THE core differentiator
- Path-aware settings.json rewriting (absolute paths break across machines)
- Smart auto-merge for non-conflicting changes (enables hands-free operation)
- Dry-run/preview mode
- Conflict detection with clear resolution UX
- Sync health notifications

**Defer (v2+):**
- Claude Code session start/end hooks
- Multi-repo support (work vs personal)
- Sync validation/integrity checks
- Migration tooling from chezmoi/claude-brain

**Anti-features (do NOT build):**
- Per-machine templates/overrides -- explicitly out of scope per PROJECT.md
- Secret/credential encryption -- no secrets in ~/.claude per PROJECT.md
- LLM-powered semantic merge -- non-deterministic, costs money, unnecessary
- GUI/web dashboard -- CLI-only tool
- Session/history sync -- large files, constant conflicts, different product

### Architecture Approach

The architecture follows a "source of truth + apply" pattern with a dedicated sync repository (at `~/.claude-sync/` or similar) separate from the target `~/.claude` directory. Files are copied between the repo and target -- not symlinked (symlinks break on WSL). The system layers into five build phases: foundation (paths, config, filter), Git operations, sync engine (scanner, differ, resolver), CLI commands, and finally the file watcher/daemon. This layering ensures each phase delivers a usable increment. See ARCHITECTURE.md for full component diagrams and data flow.

**Major components:**
1. **CLI Interface** -- thin command layer (init, sync, status, diff) delegating to core engine
2. **Sync Engine** -- orchestrates the detect-diff-apply cycle: scanner, differ, conflict resolver
3. **Git Operations** -- abstracted layer wrapping simple-git with retry logic and error handling
4. **File Watcher/Daemon** -- chokidar-based watcher with debouncing, runs as background process
5. **Platform Abstractions** -- cross-platform path resolution, home directory detection, daemon management

### Critical Pitfalls

1. **Syncing machine-local state into Git** -- The `~/.claude` directory contains 1.6+ GB of ephemeral data (projects, debug, telemetry). Use an allowlist approach, not a blocklist. Default to ignoring everything; explicitly include only user-authored config. Repo size should stay under 1 MB.

2. **Hardcoded absolute paths in settings.json** -- Hook paths contain `/Users/wohlgemuth/...` which breaks on any other machine. Rewrite paths to `{{HOME}}` tokens on commit, expand on apply. This must ship in Phase 1 or the first cross-machine sync will break.

3. **Git merge conflicts during unattended auto-sync** -- Two machines editing settings.json between sync intervals produces merge conflicts with no human to resolve. Strategy: sync frequently, use `git pull --rebase`, implement last-writer-wins with automatic backup of the losing side.

4. **The ~/.claude.json trap** -- This file (separate from settings.json) mixes user config (MCP servers) with runtime counters that change every launch. Do NOT sync it wholesale. Extract MCP server config only if needed, or exclude entirely.

5. **Line ending corruption across platforms** -- Ship `.gitattributes` forcing LF everywhere as the very first commit in the sync repo. Without this, hook scripts synced from Windows to Linux break with `\r: command not found`.

## Implications for Roadmap

Based on combined research, the following phase structure emerges from dependency analysis and risk ordering.

### Phase 1: Foundation and Core Sync

**Rationale:** Everything depends on the file selection model, path resolution, and Git abstraction. Getting these wrong poisons all downstream work. This phase makes the critical design decisions (allowlist vs blocklist, copy vs symlink, path token format) that cannot be changed later without starting over.

**Delivers:** A working `claude-sync init`, `claude-sync sync` (manual push/pull), and `claude-sync status` on a single platform (macOS). User can set up a repo from existing `~/.claude`, push to remote, clone on a second machine, and manually sync changes.

**Addresses features:** Git-backed sync, selective file sync with Claude-aware defaults, init from existing ~/.claude, push/pull commands, status command, backup before pull.

**Avoids pitfalls:** Syncing machine-local state (allowlist from day one), hardcoded paths (path rewriting in initial design), line ending corruption (.gitattributes as first commit), symlink failures (copy-based approach), non-idempotent setup.

### Phase 2: Cross-Platform Support

**Rationale:** The tool must work on macOS, Linux, and WSL. This phase extends the foundation with platform-specific path resolution, home directory detection (including WSL edge cases), and cross-platform testing. Path rewriting (the `{{HOME}}` token system) gets exercised against real cross-platform scenarios.

**Delivers:** Full cross-platform sync between macOS, Linux, and WSL machines. Settings.json works correctly regardless of source/target OS. Hook scripts execute without line-ending issues.

**Addresses features:** Cross-platform support (macOS/Linux/WSL), path-aware settings.json rewriting.

**Avoids pitfalls:** Hardcoded absolute paths (verified across OSes), line ending corruption (tested cross-platform), plugin dependency mismatches (dependency checks on apply).

### Phase 3: Automatic Background Sync

**Rationale:** This is the core differentiator (THE feature that sets this apart from chezmoi, yadm, and claude-brain) but it depends on reliable manual sync working first. The watcher/daemon layer is the most platform-dependent and hardest to debug. Building it after manual sync is proven de-risks the project.

**Delivers:** File watcher daemon that auto-syncs on change. Debounced to batch rapid edits. Runs as launchd service (macOS) or systemd user unit (Linux). User sets up once, never thinks about sync again.

**Addresses features:** Automatic background sync, smart auto-merge for non-conflicting changes, sync health notifications.

**Avoids pitfalls:** Git merge conflicts on auto-sync (frequent sync + rebase + last-writer-wins), daemon failing silently (health check + logging + restart policies), real-time sync without debouncing (2-5 second debounce window).

### Phase 4: UX Polish and Reliability

**Rationale:** Once automatic sync is working, harden it. Add dry-run mode, improve conflict resolution UX, add health checks and notifications, handle edge cases discovered during Phase 3 testing.

**Delivers:** Production-quality tool with dry-run previews, clear conflict resolution, health monitoring, and recovery from auth failures and daemon crashes.

**Addresses features:** Dry-run/preview mode, conflict detection with clear UX, sync health notifications, git auth verification and recovery.

**Avoids pitfalls:** Silent daemon failure (health monitoring), git auth expiry (proactive detection), CLAUDE.md conflict churn (merge strategy).

### Phase Ordering Rationale

- **Foundation before cross-platform** because the allowlist model, path rewriting strategy, and copy-vs-symlink decision must be locked in before testing across OSes. Changing these later would require rewriting the core.
- **Manual sync before automatic** because every auto-sync bug is harder to diagnose than the equivalent manual sync bug. Proving the sync engine works with explicit commands first means the daemon layer only adds scheduling, not sync logic.
- **Automatic sync before UX polish** because the differentiator must work before it gets polished. Shipping a beautiful manual-only tool is not competitive.
- **UX polish last** because it depends on discovering real-world edge cases from the previous phases.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Cross-Platform):** WSL filesystem behavior, Windows path edge cases, and how Claude Code itself resolves paths on WSL need investigation. Sparse documentation on WSL-specific `~/.claude` behavior.
- **Phase 3 (Automatic Sync):** Daemon lifecycle management across launchd/systemd, proper signal handling, and debounce tuning require experimentation. The exact behavior of chokidar on WSL filesystem events needs testing.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Well-documented patterns from chezmoi architecture, simple-git API docs, and established Git workflows. All libraries are mature with extensive documentation.
- **Phase 4 (UX Polish):** Standard CLI UX patterns (dry-run, status display, error messaging). No novel technical challenges.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages verified on npm with current version numbers, download counts, and maintenance status. Node.js LTS timeline confirmed against official release schedule. |
| Features | HIGH | Feature landscape validated against 6+ existing tools (chezmoi, yadm, claude-brain, CCMS, bare git, dotfiles-auto-sync). Competitor analysis is thorough. Anti-features well-reasoned against PROJECT.md constraints. |
| Architecture | HIGH | Source-of-truth + apply pattern is battle-tested by chezmoi (most popular dotfile manager). Build order validated against dependency analysis. Actual ~/.claude directory structure examined with real file sizes. |
| Pitfalls | HIGH | Pitfalls derived from actual examination of ~/.claude directory (real sizes, real file contents, real path patterns in settings.json). Cross-platform issues validated against documented WSL/Windows symlink bugs. |

**Overall confidence:** HIGH

### Gaps to Address

- **WSL filesystem event behavior with chokidar:** Research confirms chokidar normalizes cross-platform watching, but WSL's drvfs/9p filesystem has known quirks with inotify. Needs hands-on testing during Phase 2/3.
- **~/.claude.json MCP server syncing:** The decision to exclude ~/.claude.json is clear, but users may want MCP server config synced. The extraction approach (pulling just the mcpServers key) needs design work if this becomes a requirement. Defer until user feedback.
- **Claude Code update resilience:** When Claude Code updates, new directories/files may appear in ~/.claude. The allowlist approach handles this gracefully (new unknowns are ignored), but the allowlist itself may need updating. No automated mechanism for this yet.
- **Debounce interval tuning:** Architecture recommends 2-5 seconds but the optimal value depends on real-world editing patterns. Needs empirical testing during Phase 3.
- **settings.json path pattern coverage:** Path rewriting needs to handle not just `$HOME/.claude/` prefixes but potentially arbitrary absolute paths in hook commands. The full set of path patterns in settings.json needs cataloging.

## Sources

### Primary (HIGH confidence)
- [simple-git on npm](https://www.npmjs.com/package/simple-git) -- version, API, maintenance status
- [commander on npm](https://www.npmjs.com/package/commander) -- version, ESM timeline
- [chokidar on GitHub](https://github.com/paulmillr/chokidar) -- v4 vs v5, cross-platform behavior
- [Node.js releases](https://nodejs.org/en/about/previous-releases) -- v22 LTS timeline
- [TypeScript releases](https://github.com/microsoft/typescript/releases) -- v5.9.3 stable
- [chezmoi architecture](https://www.chezmoi.io/developer-guide/architecture/) -- source-of-truth pattern
- [chezmoi comparison table](https://www.chezmoi.io/comparison-table/) -- feature matrix
- [GitHub Docs - Line endings](https://docs.github.com/en/get-started/git-basics/configuring-git-to-handle-line-endings) -- .gitattributes
- [Node.js recursive fs.watch Linux issues](https://github.com/nodejs/node/issues/48437) -- crash bugs
- Direct examination of ~/.claude/ directory (2026-03-08) -- actual structure, sizes, path patterns

### Secondary (MEDIUM confidence)
- [Dotfiles bare git repo](https://www.atlassian.com/git/tutorials/dotfiles) -- community consensus
- [Biome vs ESLint comparison](https://betterstack.com/community/guides/scaling-nodejs/biome-eslint/) -- benchmarks
- [tsup on GitHub](https://github.com/egoist/tsup) -- maintenance status
- [claude-brain](https://github.com/toroleapinc/claude-brain) -- Claude-specific sync approach
- [CCMS](https://github.com/miwidot/ccms) -- Claude Code Machine Sync
- [Arch Wiki - Dotfiles](https://wiki.archlinux.org/title/Dotfiles) -- dotfile management approaches
- [Trail of Bits - WSL symlinks](https://blog.trailofbits.com/2024/02/12/why-windows-cant-follow-wsl-symlinks/) -- symlink incompatibility

### Tertiary (LOW confidence)
- Debounce interval recommendations (2-5 seconds) -- derived from multiple sources but optimal value needs empirical testing
- WSL chokidar behavior -- inferred from general chokidar cross-platform claims, not directly tested on WSL

---
*Research completed: 2026-03-08*
*Ready for roadmap: yes*
