# Feature Research

**Domain:** Dotfile/config sync tools (specifically ~/.claude sync)
**Researched:** 2026-03-08
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Git-backed version control | Every dotfile manager uses git as transport. Users expect versioned history of config changes. | LOW | Use a bare or standard git repo as the sync backbone. chezmoi, yadm, bare git, claude-brain all use this pattern. |
| Cross-platform support (macOS, Linux, WSL) | PROJECT.md explicitly requires this. All serious dotfile tools support at minimum macOS + Linux. WSL is increasingly expected. | MEDIUM | fswatch (macOS FSEvents), inotify (Linux), and WSL filesystem events differ. Abstraction needed. |
| Selective file sync (include/exclude) | ~/.claude contains ~26 items. Many are machine-local (session-env, shell-snapshots, debug, telemetry, history.jsonl, projects/). Users must control what syncs. | LOW | Use a manifest or .gitignore-style pattern file. Default should exclude ephemeral/local data. |
| One-command setup on new machine | chezmoi: `sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply $GITHUB_USER`. Users expect a single command to bootstrap a fresh machine. | LOW | `claude-sync init <repo-url>` or similar. Clone repo, symlink/copy files into ~/.claude/. |
| Push/pull sync operations | Even "automatic" tools need explicit push/pull as escape hatches. yadm, chezmoi, CCMS, bare git all provide this. | LOW | Thin wrappers around git add/commit/push and git pull. Core primitive everything else builds on. |
| Conflict detection | When two machines edit the same file, users expect to be warned rather than silently losing data. | MEDIUM | Git merge conflicts surface this naturally. Need clear UX for resolution (show diff, pick version). |
| Backup before sync | CCMS creates snapshots before pull. Users expect a safety net when pulling potentially destructive changes. | LOW | Copy current state to ~/.claude-backup/ or timestamped archive before applying remote changes. |
| Dry-run / preview mode | chezmoi has `chezmoi diff`, CCMS defaults to dry-run. Users want to see what will change before it happens. | LOW | Show diff of what would be applied. Essential trust-building feature. |
| Status command | Show what's changed locally, what's out of sync with remote, what's excluded. Every git-based tool provides this. | LOW | Wrapper around git status + custom display of sync state. |

### Differentiators (Competitive Advantage)

Features that set the product apart from manual git repos, chezmoi-based approaches, and claude-brain.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Automatic background sync (zero intervention) | PROJECT.md core value: "zero manual sync effort." No existing tool does this well for ~/.claude specifically. claude-brain syncs at session start/end (not continuous). CCMS is manual. chezmoi is manual. This is THE differentiator. | HIGH | Requires file watcher (fswatch/inotify) + background daemon (launchd on macOS, systemd on Linux). Must handle debouncing, batching, and error recovery. |
| Claude-aware default manifest | Other tools are generic dotfile managers that require users to figure out what to sync. A tool built specifically for ~/.claude knows which files are config (sync) vs ephemeral (skip). Ships with opinionated defaults. | LOW | Hardcoded knowledge: sync settings.json, commands/, agents/, hooks/, get-shit-done/, CLAUDE.md, plugins/marketplaces/. Skip: history.jsonl, debug/, session-env/, shell-snapshots/, telemetry/, statsig/, file-history/, projects/, todos/, plans/, paste-cache/, ide/, cache/, backups/. |
| Path-aware settings.json rewriting | settings.json contains absolute paths (e.g., `/Users/wohlgemuth/.claude/hooks/gsd-statusline.js`). Syncing this verbatim to a Linux machine breaks. Auto-rewriting paths on apply is a genuine differentiator. | MEDIUM | Detect `$HOME`-relative paths in JSON values and normalize to `~/.claude/...` in the repo, expand on apply. Critical for cross-platform. |
| Smart auto-merge for non-conflicting changes | When Machine A adds a new skill and Machine B adds a new command, these don't conflict. Auto-merging without user intervention for additive-only changes keeps the "zero effort" promise. | MEDIUM | Git handles file-level non-conflicts natively. For settings.json (single file, multiple keys), may need JSON-aware merge. |
| Init from existing ~/.claude | Unlike bootstrapping from scratch, most users already have a populated ~/.claude. First-run should detect existing config, create the repo from it, and push -- not require the user to manually set up a repo first. | LOW | `claude-sync init` scans ~/.claude, applies default manifest, creates git repo, makes initial commit, prompts for remote URL. |
| Sync health notifications | After background sync succeeds or fails, surface a brief notification. Especially important for conflicts that need manual resolution. | LOW | Write status to a file that Claude Code hooks can read, or use OS-native notifications (terminal-title, osascript on macOS). |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems. Explicitly NOT building these.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Per-machine config overrides / templates | chezmoi and yadm's flagship feature. Allows machine-specific variations via Go templates. | PROJECT.md explicitly states "all machines are identical." Templates add massive complexity (template syntax, variables, conditionals). For this user's use case, it's pure overhead. | If a rare file needs per-machine variation in the future, use a `.local` override pattern (e.g., settings.local.json merged at apply time). Don't build a template engine. |
| Secret/credential encryption | chezmoi supports age/gpg encryption. claude-brain strips env vars. Seems like a safety feature. | PROJECT.md states "no secrets in ~/.claude." Adding encryption adds key management complexity (distributing private keys across machines), makes diffs unreadable, and solves a problem that doesn't exist. | Document that secrets should NOT be placed in synced files. Add a `.gitignore` for common secret patterns as a safety net. |
| LLM-powered semantic merge | claude-brain's headline feature. Uses Claude API to semantically merge CLAUDE.md and memory files. | Costs money per sync (~$0.01-0.50), requires API access, adds latency, and introduces non-determinism. For config files that are human-authored (not auto-generated prose), standard git merge is sufficient and free. | Use git's built-in merge. For the rare true conflict, show a diff and let the user resolve it manually. |
| GUI / web dashboard | Visualize sync state, browse history, manage configs through a web UI. | PROJECT.md says "CLI-only tool." A GUI adds massive scope (web server, frontend framework, state management) for a tool that should be invisible. | CLI status command + OS notifications. The best sync tool is one you never think about. |
| Real-time multi-machine push | Push changes to other machines immediately (via SSH, websocket, etc.) rather than having each machine pull. | Requires machines to be online simultaneously, opens network security concerns, needs persistent connections or SSH access between machines. dotsync tried this with rsync-over-SSH -- fragile. | Git remote as intermediary. Each machine pushes to remote; other machines pull on schedule or file-change trigger. Eventual consistency (seconds/minutes) is fine for config sync. |
| Session/history sync | Sync history.jsonl, projects/, session transcripts across machines. | These files are large (history.jsonl is 280KB+ and growing), machine-specific, and would create constant merge conflicts. Git is not designed for append-heavy log files. | Explicitly exclude. If users want session search across machines, that's a different product. |
| Plugin marketplace state sync | Sync plugins/blocklist.json, install-counts-cache.json, known_marketplaces.json. | Marketplace state includes install counts, caches, and blocklists that may be machine-specific or stale. Syncing could cause plugin installation issues. | Sync plugin configuration files only if they exist in a user-managed directory. Let marketplace state regenerate naturally on each machine. |

## Feature Dependencies

```
[Git-backed sync]
    |
    +-- requires --> [Selective file sync (manifest)]
    |                    |
    |                    +-- enables --> [Claude-aware default manifest]
    |
    +-- requires --> [Push/pull operations]
    |                    |
    |                    +-- enables --> [Automatic background sync]
    |                    |                   |
    |                    |                   +-- enhances --> [Sync health notifications]
    |                    |
    |                    +-- enables --> [Smart auto-merge]
    |
    +-- enables --> [Conflict detection]
    |                   |
    |                   +-- enables --> [Backup before sync]
    |
    +-- enables --> [Dry-run / preview mode]
    |
    +-- enables --> [Status command]

[One-command setup] -- requires --> [Init from existing ~/.claude]

[Cross-platform support] -- requires --> [Path-aware settings.json rewriting]
```

### Dependency Notes

- **Automatic background sync requires push/pull operations:** The daemon is just a scheduler around the core push/pull primitives. Build push/pull first, then automate.
- **Claude-aware default manifest requires selective file sync:** The manifest is a specific instance of the include/exclude system. Build the mechanism first, then ship smart defaults.
- **Path-aware rewriting requires cross-platform support:** Path rewriting only matters when machines run different OSes. It's the key enabler for true cross-platform sync.
- **Smart auto-merge enhances push/pull:** Without auto-merge, every pull that has remote changes requires manual intervention. Auto-merge for non-conflicting changes is what makes background sync viable.
- **Sync health notifications enhance automatic sync:** Without notifications, background sync failures go unnoticed. Not needed for manual push/pull (user sees output directly).

## MVP Definition

### Launch With (v1)

Minimum viable product -- what's needed to validate the concept.

- [ ] Git-backed sync with a remote repository -- the foundational transport layer
- [ ] Claude-aware default manifest -- ship opinionated include/exclude rules so users don't have to figure out what to sync
- [ ] Selective file sync via manifest file -- let users override defaults if needed
- [ ] Init from existing ~/.claude -- detect current config, create repo, push. Most users already have a populated ~/.claude
- [ ] One-command setup on new machine -- clone and apply from remote
- [ ] Push/pull commands -- explicit sync operations
- [ ] Status command -- show what's changed, what's synced, what's excluded
- [ ] Backup before pull -- safety net for destructive remote changes
- [ ] Cross-platform support (macOS, Linux, WSL) -- all three from day one

### Add After Validation (v1.x)

Features to add once core is working and validated on multiple machines.

- [ ] Automatic background sync daemon -- add when manual push/pull works reliably and user confirms the pattern is right
- [ ] Dry-run / preview mode -- add when users request more visibility before applying
- [ ] Conflict detection with clear resolution UX -- add when users start hitting conflicts from multi-machine edits
- [ ] Path-aware settings.json rewriting -- add when cross-platform users report path breakage
- [ ] Smart auto-merge for non-conflicting changes -- add when background sync is implemented (prerequisite for hands-free operation)
- [ ] Sync health notifications -- add alongside background sync daemon

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Hook into Claude Code session start/end -- auto-pull on session start, auto-push on session end (like claude-brain)
- [ ] Multi-repo support -- sync different subsets to different remotes (e.g., work vs personal)
- [ ] Sync validation / integrity checks -- verify synced config is valid before applying (e.g., JSON schema validation for settings.json)
- [ ] Migration tooling -- import from chezmoi, claude-brain, or manual git setups

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Git-backed sync | HIGH | LOW | P1 |
| Claude-aware default manifest | HIGH | LOW | P1 |
| Selective file sync (manifest) | HIGH | LOW | P1 |
| Init from existing ~/.claude | HIGH | LOW | P1 |
| One-command new machine setup | HIGH | LOW | P1 |
| Push/pull commands | HIGH | LOW | P1 |
| Status command | MEDIUM | LOW | P1 |
| Backup before pull | HIGH | LOW | P1 |
| Cross-platform (macOS/Linux/WSL) | HIGH | MEDIUM | P1 |
| Automatic background sync | HIGH | HIGH | P2 |
| Dry-run / preview mode | MEDIUM | LOW | P2 |
| Conflict detection UX | MEDIUM | MEDIUM | P2 |
| Path-aware settings.json rewriting | HIGH | MEDIUM | P2 |
| Smart auto-merge | MEDIUM | MEDIUM | P2 |
| Sync health notifications | LOW | LOW | P2 |
| Session start/end hooks | MEDIUM | LOW | P3 |
| Multi-repo support | LOW | MEDIUM | P3 |
| Sync validation | LOW | MEDIUM | P3 |
| Migration tooling | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | chezmoi (general dotfiles) | claude-brain (Claude-specific) | CCMS (Claude-specific) | bare git + scripts | Our Approach |
|---------|---------------------------|-------------------------------|------------------------|--------------------|----|
| Git-backed sync | Yes | Yes | No (rsync/SSH) | Yes | Yes -- standard pattern |
| Cross-platform | macOS/Linux/Windows | macOS/Linux/WSL | macOS/Linux | Any | macOS/Linux/WSL |
| Automatic sync | No (manual apply) | Session start/end hooks | No (manual) | No (manual or cron) | Background daemon with file watching |
| Claude-aware defaults | No (generic) | Yes (knows what to sync) | Syncs everything by default | No | Yes -- opinionated manifest |
| Selective sync | Yes (chezmoi add) | Yes (excludes secrets/tokens) | Yes (rsync exclude patterns) | Yes (.gitignore) | Yes (manifest + .gitignore) |
| Path rewriting | Yes (templates) | No | No | No | Yes (settings.json path normalization) |
| Conflict resolution | Yes (merge command) | LLM semantic merge | Manual | Manual (git) | Git-native merge with clear UX |
| Encryption | age, gpg, git-crypt | age (optional) | No | No | No (not needed per PROJECT.md) |
| Templates | Go templates | No | No | No | No (anti-feature per PROJECT.md) |
| Setup complexity | Medium (learn chezmoi) | Medium (install plugin + git) | Low (single bash script) | High (DIY) | Low (single binary or script, one command) |
| Dependencies | chezmoi binary | git, jq, Claude CLI, age | rsync, SSH | git | git, platform file watcher |
| Ongoing cost | Free | $0.50-$2/month API calls | Free | Free | Free |
| Backup/safety | Yes (diff before apply) | Yes (backup before import) | Yes (snapshots) | Manual | Yes (auto-backup before pull) |

## Analysis of ~/.claude Directory Contents

Understanding what to sync vs skip is critical for the Claude-aware manifest.

| Path | Type | Sync? | Rationale |
|------|------|-------|-----------|
| `CLAUDE.md` | User config | YES | Global instructions -- core user identity |
| `settings.json` | User config | YES | Permissions, hooks, effort level -- needs path rewriting |
| `commands/` | User content | YES | Custom slash commands |
| `agents/` | User content | YES | Agent definitions (e.g., gsd-* agents) |
| `hooks/` | User content | YES | Custom hook scripts |
| `get-shit-done/` | User content | YES | GSD framework (bin, templates, references, workflows) |
| `package.json` | User config | YES | Dependencies if any |
| `gsd-file-manifest.json` | Framework state | YES | GSD framework state |
| `plugins/marketplaces/` | User config | MAYBE | Marketplace configs -- may contain machine-specific state |
| `plugins/blocklist.json` | User config | MAYBE | Blocklist could be user preference (sync) or machine state (skip) |
| `plugins/install-counts-cache.json` | Cache | NO | Regenerates automatically |
| `plugins/known_marketplaces.json` | Cache | NO | Regenerates automatically |
| `history.jsonl` | Session data | NO | Large, append-only, machine-specific |
| `debug/` | Ephemeral | NO | Debug logs -- machine-specific |
| `session-env/` | Ephemeral | NO | Per-session environment -- machine-specific |
| `shell-snapshots/` | Ephemeral | NO | Shell state captures -- machine-specific |
| `telemetry/` | Ephemeral | NO | Usage telemetry -- machine-specific |
| `statsig/` | Cache | NO | Feature flag cache -- regenerates |
| `file-history/` | Session data | NO | File backups from edits -- machine-specific, large |
| `projects/` | Session data | NO | Conversation transcripts -- machine-specific, large, private |
| `todos/` | Session data | NO | Task lists from sessions -- machine-specific |
| `plans/` | Session data | NO | Implementation plans -- machine-specific |
| `paste-cache/` | Cache | NO | Clipboard cache -- ephemeral |
| `ide/` | Runtime | NO | IDE integration locks -- machine-specific |
| `cache/` | Cache | NO | General cache -- regenerates |
| `backups/` | Local safety | NO | Local backups -- machine-specific |
| `downloads/` | Ephemeral | NO | Downloaded files -- machine-specific |
| `tasks/` | Session data | NO | Task execution logs -- machine-specific |

## Sources

- [chezmoi comparison table](https://www.chezmoi.io/comparison-table/) -- comprehensive feature matrix across dotfile managers
- [chezmoi - Why use chezmoi?](https://www.chezmoi.io/why-use-chezmoi/) -- feature rationale and problem statements
- [yadm](https://yadm.io/) -- alternate files, encryption, bootstrap, hooks features
- [claude-brain](https://github.com/toroleapinc/claude-brain) -- Claude-specific sync with semantic merge, N-way convergence
- [CCMS](https://github.com/miwidot/ccms) -- Claude Code Machine Sync via rsync/SSH
- [Syncing Claude Code settings](https://brianlovin.com/writing/syncing-claude-code-settings-between-computers-am7lNQ8) -- git repo + symlink approach
- [Sync Claude Code with chezmoi and age](https://www.arun.blog/sync-claude-code-with-chezmoi-and-age/) -- encrypted chezmoi approach
- [dotfiles-auto-sync](https://github.com/5h3rr1ll/dotfiles-auto-sync) -- macOS LaunchAgent + yadm approach
- [git-auto-sync](https://github.com/GitJournal/git-auto-sync) -- background daemon for git repos
- [dotfile_syncer](https://github.com/willcurtis/dotfile_syncer) -- file watcher auto-commit tool
- [dotfiles.github.io](https://dotfiles.github.io/utilities/) -- general dotfile utility catalog
- [Claude Code ~/.claude structure](https://gist.github.com/samkeen/dc6a9771a78d1ecee7eb9ec1307f1b52) -- directory structure analysis
- [Feature Request: Account-level settings sync](https://github.com/anthropics/claude-code/issues/22648) -- community demand signal

---
*Feature research for: Claude Config Sync (dotfile/config sync for ~/.claude)*
*Researched: 2026-03-08*
