# Changelog

All notable changes to ai-sync are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). See
"Versioning & changelog" in `CLAUDE.md` for the bump rules.

## [Unreleased]

## [0.3.0] - 2026-10-27

First changelog entry. Covers the 60 commits since the `v0.2.3.1` tag (2026-03-21),
which were never versioned, plus the plugin-marketplace exclusion below.

### Added

- AI-assisted 3-way merge for pull conflicts, enabled by default: `MergeResolver`
  interface with claude-cli, codex-cli, and opencode-cli adapters; per-file-type
  strategy dispatch with parse validation; staged merges reviewed via
  `ai-sync resolve list | diff | accept | reject`.
- `ai-sync status` drift report, and `status --summarize` for an AI-written summary.
- `--report` flag on push/pull to write a markdown before/after record of a sync.
- Fragment model, auto-provisioning, and the v3 sync-repo format.
- Codex sync environment; OpenCode now syncs `AGENTS.md`.
- `rules/` and `keybindings.json` added to the Claude sync targets.
- Pre-push safety backup of the sync repo, and the `AI_SYNC_DEV=1` dev-mode guard.
- Linux, macOS, and Windows CI matrix; Dependabot for npm and GitHub Actions.

### Changed

- **Stopped syncing `plugins/marketplaces/`.** It is a per-machine clone of each plugin
  marketplace that Claude Code refreshes on its own, so copies drifted between machines
  and every pull produced hundreds of meaningless conflicts. Each machine re-clones it
  from the still-synced `plugins/known_marketplaces.json`. Copies already committed to
  a sync repo are no longer read or written, but stay in its git history until removed.
- Stopped syncing machine-local `plugins/cache/` and `plugins/data/`.
- Checkouts enforce LF line endings; biome formatting applied repo-wide.

### Fixed

- AI merge passed the prompt file's *path* to `claude -p` instead of its contents, so
  every merge timed out and fell back to keep-local. The prompt is now piped on stdin,
  and non-merge output is rejected.
- CRLF-only differences no longer show up as drift in `status`.
- `git add` is batched to avoid `ENAMETOOLONG` on large change sets.
- Push `--dry-run` hardened so it cannot mutate the sync repo.
- Windows: direct CLI invocation detection; installer env menu and prompts under Git Bash.
- `bootstrap` no longer triggers an SSH check for HTTPS URLs.
- CLI flags wired through correctly; provisioning output fixed.

### Security

- Pull never writes through a symlinked destination (CRIT-2); the scanner and
  destination writes refuse symlink traversal.
- Paths and URLs are validated across the sync boundary.

## Earlier versions

Releases up to `v0.2.3.1` predate this changelog; see the git tags. Note that those tags
do not match the `package.json` version they contain.

[Unreleased]: https://github.com/johnzastrow/ai-sync/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/johnzastrow/ai-sync/compare/v0.2.3.1...v0.3.0
