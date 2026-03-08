# Claude Config Sync

## What This Is

A tool that keeps `~/.claude` synchronized across multiple workstations (macOS, Linux, Windows/WSL) automatically. It syncs skills, plugins, CLAUDE.md, settings, and config files so every machine has an identical Claude Code environment without manual intervention.

## Core Value

Changes to the Claude environment on any machine automatically propagate to all other machines — zero manual sync effort.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] All `~/.claude` config files stay in sync across macOS, Linux, and Windows/WSL
- [ ] Skills and plugins are synchronized across machines
- [ ] CLAUDE.md and settings.json propagate automatically
- [ ] Sync happens without user intervention after initial setup
- [ ] No secrets or sensitive data concerns (config-only content)
- [ ] All machines have identical configurations (no per-machine overrides needed)
- [ ] Simple initial setup on each new machine

### Out of Scope

- Per-machine config overrides — all machines are identical
- Secret/credential management — no secrets in `~/.claude`
- Project-specific `.claude` directories — only `~/.claude` (home)
- GUI or web interface — CLI-only tool

## Context

- User has dozens of skills and plugins in `~/.claude`
- Currently no sync mechanism — each machine is independent
- Cross-platform: macOS, Linux, Windows/WSL all need support
- User prefers fully automatic sync (no manual push/pull)
- Content is all config/instructions, nothing sensitive — safe for Git

## Constraints

- **Cross-platform**: Must work on macOS, Linux, and Windows/WSL with identical behavior
- **Simplicity**: User wants this as simple as possible — minimal moving parts
- **Automatic**: After initial setup, sync should require no manual steps

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Git-backed sync | Reliable, versioned, works everywhere, no cloud vendor lock-in | — Pending |
| No per-machine overrides | User confirmed all machines should be identical | — Pending |
| No secret handling | User confirmed no secrets in ~/.claude | — Pending |

---
*Last updated: 2026-03-08 after initialization*
