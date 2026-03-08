# Pitfalls Research

**Domain:** Dotfile/config sync tool for `~/.claude` across workstations
**Researched:** 2026-03-08
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Syncing Machine-Local State as if It Were Config

**What goes wrong:**
The `~/.claude` directory contains a mix of user-authored config (settings, agents, commands, hooks, plugins) and machine-local ephemeral state (session history, debug logs, telemetry, file-history, paste-cache, shell-snapshots, statsig cache). On the actual machine examined:

| Directory | Size | Type |
|-----------|------|------|
| `projects/` | 964 MB | Session history -- machine-local |
| `debug/` | 380 MB | Debug logs -- machine-local |
| `telemetry/` | 134 MB | Analytics -- machine-local |
| `file-history/` | 92 MB | File snapshots -- machine-local |
| `downloads/` | 71 MB | Downloads -- machine-local |
| `agents/` | 256 KB | User config -- SYNC |
| `commands/` | 136 KB | User config -- SYNC |
| `hooks/` | 20 KB | User config -- SYNC |
| `plugins/` | 13 MB | Mixed (marketplace metadata is local) |
| `settings.json` | 644 B | User config -- SYNC |
| `history.jsonl` | 281 KB | Chat history -- machine-local |

Syncing everything means pushing 1.6+ GB of machine-local data into git on every commit, creating enormous repos, slow clones, and merge conflicts on files that should never leave the machine.

**Why it happens:**
Developers treat `~/.claude` as a monolithic directory and sync the entire thing rather than identifying the subset that represents portable configuration. The PROJECT.md states "All `~/.claude` config files stay in sync" and "No per-machine overrides needed" -- but the directory contains far more than config files.

**How to avoid:**
Build an explicit allowlist of syncable paths, not a blocklist. Only these should sync:
- `settings.json` (user preferences)
- `CLAUDE.md` (global instructions, if present)
- `agents/` (custom agent definitions)
- `commands/` (custom slash commands)
- `hooks/` (hook scripts)
- `get-shit-done/` (GSD plugin)
- `plans/` (planning templates, possibly)
- `package.json` (dependency declarations)

Everything else stays local. The tool should fail-safe: if an unknown new directory appears in `~/.claude`, it should NOT be synced by default.

**Warning signs:**
- Git repo size exceeds 10 MB (for a config-only sync, it should be under 1 MB)
- `.gitignore` uses a blocklist pattern (listing things to exclude) rather than an allowlist pattern (listing things to include)
- `git status` shows hundreds of changed files after a single Claude Code session

**Phase to address:**
Phase 1 (Core Sync). This is the most fundamental design decision. Getting the file selection wrong poisons everything downstream.

---

### Pitfall 2: Hardcoded Absolute Paths That Break Across Machines

**What goes wrong:**
The actual `settings.json` on this machine contains:
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "command": "node \"/Users/wohlgemuth/.claude/hooks/gsd-check-update.js\""
      }]
    }]
  },
  "statusLine": {
    "command": "node \"/Users/wohlgemuth/.claude/hooks/gsd-statusline.js\""
  }
}
```

These paths contain `/Users/wohlgemuth/` -- a macOS-specific username-specific absolute path. Syncing this file verbatim to a Linux machine (home at `/home/bob/`) or another Mac (home at `/Users/alice/`) breaks every hook reference. Claude Code would fail to load hooks silently or throw errors on startup.

The same issue affects `~/.claude.json` which stores MCP server paths with absolute references, and any plugin configs that reference filesystem locations.

**Why it happens:**
Claude Code writes absolute paths because it runs on one machine and doesn't need portability. The sync tool must account for this reality rather than assuming config files are portable as-is.

**How to avoid:**
Two possible strategies (choose one during design):

1. **Path rewriting at sync time:** When committing to the sync repo, replace the user's home directory prefix (`$HOME` / `~`) with a placeholder token like `{{HOME}}`. When applying on another machine, expand the token back to that machine's home directory. This is the approach chezmoi uses with templates.

2. **Post-apply fixup script:** After pulling config, run a script that rewrites known path patterns (`/Users/*/` or `/home/*/`) to the local user's home directory.

Strategy 1 is strongly preferred because it's deterministic and doesn't rely on regex pattern matching against unknown path formats.

**Warning signs:**
- Grep the sync repo for `/Users/` or `/home/` -- any matches indicate un-templated absolute paths
- Hooks or MCP servers failing on the second machine after initial sync
- `settings.json` containing OS-specific path separators

**Phase to address:**
Phase 1 (Core Sync). Must be solved before the first cross-machine sync or users will experience broken configs immediately.

---

### Pitfall 3: Git Merge Conflicts on Auto-Sync with No Human in the Loop

**What goes wrong:**
The project requires "sync happens without user intervention after initial setup." But git merges can fail. When two machines edit the same file (e.g., `settings.json`) between sync intervals, the auto-pull produces a merge conflict. With no human present, the tool has three bad options:
1. Leave the repo in a conflicted state (blocks all future syncs)
2. Force-accept one side (silently drops the other machine's changes)
3. Create variant files a la git-annex (`settings.json.variant-AAA`) which Claude Code cannot read

This is the fundamental tension of fully-automatic git-based sync without a conflict resolution strategy.

**Why it happens:**
Config files like `settings.json` are single JSON files. Two machines editing different keys still produces a merge conflict because git merges are line-based, not key-based. JSON doesn't merge well because adding a key changes surrounding lines (trailing commas, brackets).

**How to avoid:**
- **Sync frequently** (every few minutes, not daily) to minimize the window for divergent edits. The smaller the window, the lower the probability of concurrent edits on config files.
- **Use `git pull --rebase`** instead of merge to keep linear history and reduce conflict scenarios.
- **Implement last-writer-wins with backup:** On conflict, accept the incoming version but save the local version as `settings.json.local-backup-TIMESTAMP`. Log a warning the user can review.
- **Split monolithic config into granular files** where possible (one file per agent, one per command) so concurrent edits to different agents never conflict. The `agents/` and `commands/` directories already have this structure -- settings.json is the main risk.
- **Never auto-sync files the user is actively editing.** Use a lockfile or timestamp check.

**Warning signs:**
- `git status` shows "both modified" or "unmerged" in the sync repo
- Sync daemon stops updating silently after a conflict
- User reports "my changes disappeared" on one machine

**Phase to address:**
Phase 1 (Core Sync) for the basic strategy, Phase 2 (Reliability) for edge case handling and conflict recovery.

---

### Pitfall 4: The `~/.claude.json` Trap -- Syncing a Rapidly-Mutating System File

**What goes wrong:**
`~/.claude.json` (note: separate from `~/.claude/settings.json`) contains MCP server configuration that users might want to sync. But it also contains:
- `numStartups` counter (changes every launch)
- `tipsHistory` (changes every session)
- `promptQueueUseCount` (changes constantly)
- `cachedStatsigGates` (runtime cache)
- `cachedGrowthBookFeatures` (runtime cache)

This file mutates on every Claude Code startup. Syncing it creates a commit on every launch, constant merge conflicts, and a git history full of meaningless counter increments.

**Why it happens:**
Claude Code stores both user config (MCP servers) and runtime state (counters, caches) in the same `~/.claude.json` file. There is no separation of concerns at the file level.

**How to avoid:**
- **Do NOT sync `~/.claude.json` as a whole.** It is primarily runtime state.
- If MCP server config needs syncing, extract just the `mcpServers` key programmatically and store it in a separate sync-managed file. On apply, merge it back into the local `~/.claude.json`.
- Alternatively, accept that MCP server configuration is inherently machine-specific (different paths, different installed tools) and exclude it from sync entirely. The PROJECT.md scope says "No per-machine overrides needed" -- but MCP servers with absolute paths are inherently per-machine.

**Warning signs:**
- Git log shows commits every few minutes with only counter/cache changes
- Merge conflicts on `~/.claude.json` after both machines run Claude Code
- Repo history grows rapidly with low-value commits

**Phase to address:**
Phase 1 (Core Sync). This is a design-time decision about scope.

---

### Pitfall 5: Symlink Strategy Fails on Windows/WSL

**What goes wrong:**
A common dotfile sync pattern is: clone repo to a central location, then symlink files into `~/.claude/`. On Windows/WSL, this breaks in multiple ways:
- Linux symlinks (created by `ln -s` inside WSL) cannot be read by Windows processes
- Windows symlinks require Developer Mode or Administrator privileges
- WSL and Windows have different filesystem semantics for the same physical files
- If Claude Code runs as a Windows process but config is in WSL filesystem, symlinks created from WSL side are invisible

**Why it happens:**
Symlinks work identically on macOS and Linux, so developers test on those platforms and assume Windows/WSL will behave the same. The fundamental issue is that WSL symlinks and Windows symlinks are different kernel objects.

**How to avoid:**
- **Use file copying, not symlinks.** Copy files from the sync repo into `~/.claude/` on apply, and copy back to the sync repo on commit. This works identically across all platforms.
- If symlinks must be used, create them from the Windows/PowerShell side using `New-Item -ItemType SymbolicLink`, never from inside WSL.
- The chezmoi approach (source of truth in a separate directory, applied by copying) avoids this entire class of problems.

**Warning signs:**
- Tool works on macOS/Linux but users report "file not found" errors on WSL
- CI tests pass on Linux but fail on Windows
- `ls -la` shows symlinks but the target application can't read them

**Phase to address:**
Phase 1 (Core Sync). The copy-vs-symlink decision must be made at architecture time.

---

### Pitfall 6: Line Ending Corruption Across Platforms

**What goes wrong:**
Windows uses CRLF line endings, macOS/Linux use LF. Without explicit configuration, git may convert line endings on checkout. A JSON config file with CRLF endings may parse differently, and shell scripts with CRLF endings will fail with `\r: command not found` errors. Hook scripts synced from Windows to Linux break silently.

**Why it happens:**
Git's default `core.autocrlf` behavior varies by platform and installation. Without a `.gitattributes` file in the sync repo, line ending behavior is non-deterministic.

**How to avoid:**
Ship a `.gitattributes` file in the sync repo from day one:
```
* text=auto eol=lf
*.json text eol=lf
*.md text eol=lf
*.js text eol=lf
*.sh text eol=lf
```
Force LF everywhere. There is no reason for any `~/.claude` config file to have CRLF endings.

**Warning signs:**
- Shell hook scripts fail on Linux with cryptic errors after syncing from Windows
- `file` command shows "with CRLF line terminators" on files that should be LF
- JSON parsing errors on one platform but not another

**Phase to address:**
Phase 1 (Core Sync). The `.gitattributes` file should be the first file committed to the sync repo.

---

## Moderate Pitfalls

### Pitfall 7: Non-Idempotent Setup Breaks Re-Runs

**What goes wrong:**
The initial setup script (clone repo, configure sync) fails on re-run. Common causes: trying to `git clone` into an existing directory, creating symlinks that already exist, or overwriting local changes without warning.

**How to avoid:**
Every operation must check preconditions: Does the repo exist? Is the file already linked/copied? Has the local version diverged? Use guard clauses (`if [ -d ... ]`) and make the setup script safe to run repeatedly. Test by running setup twice in a row.

**Warning signs:**
- Setup script crashes with "directory already exists" on second run
- Users report they can't recover from a failed initial setup

**Phase to address:**
Phase 1 (Setup/Bootstrap).

---

### Pitfall 8: Daemon/Scheduler Fails Silently

**What goes wrong:**
The auto-sync daemon (cron, launchd, systemd) stops working and nobody notices. Common causes: the machine was restarted and the daemon wasn't re-registered, the sync script exits with an error but the scheduler doesn't report it, or the git remote requires re-authentication.

**How to avoid:**
- Write sync results to a log file with timestamps
- Implement a health check: "when was the last successful sync?" accessible via a CLI command (`claude-sync status`)
- On macOS, use `launchd` with `KeepAlive` and `StandardErrorPath`
- On Linux, use `systemd` user units with `Restart=on-failure`
- Never swallow errors in the sync script

**Warning signs:**
- User hasn't synced in days but doesn't know it
- `crontab -l` shows the job but `grep` the log shows no recent entries
- Sync works manually but not automatically

**Phase to address:**
Phase 2 (Automation/Reliability).

---

### Pitfall 9: Git Authentication Expires or Breaks

**What goes wrong:**
Auto-sync requires pushing to a remote git repo. Authentication methods (SSH keys, personal access tokens, credential helpers) can expire, be revoked, or differ across machines. When auth fails, the sync daemon silently stops pushing.

**How to avoid:**
- Use SSH keys (no expiry by default) rather than HTTPS tokens
- Test authentication as part of the health check
- Provide clear error messages: "Sync failed: git push rejected. Run `claude-sync auth` to re-authenticate"
- On initial setup, verify push access before declaring success

**Warning signs:**
- `git push` fails with 403/401 errors in the sync log
- One machine is pulling but not pushing (gets changes but doesn't send them)

**Phase to address:**
Phase 1 (Initial Setup) for verification, Phase 2 (Reliability) for recovery.

---

### Pitfall 10: Plugin Files Reference Machine-Specific Dependencies

**What goes wrong:**
Plugins in `~/.claude/plugins/` or tools in `~/.claude/get-shit-done/` may reference binaries or Node modules that exist on one machine but not another. For example, a hook that runs `node "/Users/wohlgemuth/.claude/hooks/gsd-check-update.js"` requires Node.js to be installed at the expected path. If Machine B has a different Node version, a different path, or lacks Node entirely, hooks fail.

**How to avoid:**
- Use `node` (from PATH) rather than absolute paths to the Node binary
- Document runtime dependencies clearly
- Consider adding a dependency check to the sync apply step: "Warning: hook X requires `node` but it's not found in PATH"
- The `package.json` in `~/.claude/` suggests npm dependencies -- these need `npm install` on each machine after sync

**Warning signs:**
- Hooks work on Machine A but fail on Machine B
- `which node` returns different paths on different machines
- `npm install` hasn't been run on the target machine

**Phase to address:**
Phase 2 (Cross-platform polish).

---

## Minor Pitfalls

### Pitfall 11: Git History Bloat from Binary or Large Files

**What goes wrong:**
If the sync accidentally includes binary files, large JSON session logs, or download artifacts, the git repo grows rapidly. Git stores full copies of binary files (no delta compression), and once committed, they live in git history forever even if later removed.

**How to avoid:**
- Enforce the allowlist approach (Pitfall 1)
- Add a pre-commit hook that rejects files over a size threshold (e.g., 100 KB)
- Use `git rev-list --objects --all | git cat-file --batch-check` periodically to audit repo size

**Warning signs:**
- `git clone` takes longer than a few seconds
- `.git` directory exceeds 10 MB

**Phase to address:**
Phase 1 (Core Sync).

---

### Pitfall 12: CLAUDE.md at Home Level Conflates Global and Project Instructions

**What goes wrong:**
`~/.claude/CLAUDE.md` is global instructions loaded for every project. If synced naively, one machine's project-specific additions pollute another machine's global context. Users who edit this file frequently create constant merge conflicts.

**How to avoid:**
- Sync it, but treat it as a "rarely changes" file
- Warn users that this file should contain truly global instructions, not project-specific ones
- Consider a merge strategy that appends rather than overwrites

**Warning signs:**
- CLAUDE.md changes frequently in the git log
- Users complain about irrelevant instructions appearing in projects

**Phase to address:**
Phase 2 (UX polish).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Sync entire `~/.claude` directory | Simple implementation, no allowlist maintenance | 1.6+ GB repos, slow clones, constant conflicts on state files | Never |
| Use symlinks instead of copies | Simpler code, instant "sync" | Breaks on Windows/WSL, fragile if repo moves | Never for cross-platform |
| Store sync config in the synced repo | One fewer file to manage | Chicken-and-egg: can't configure sync until repo is cloned | Only for non-critical defaults |
| Skip path rewriting | Simpler code, less transformation logic | Config breaks on every machine with a different username or OS | Never |
| Use `git add -A` in auto-commit | No need to track which files changed | Accidentally commits machine-local state, secrets, huge files | Never -- always use explicit paths |
| Cron-based sync without locking | Easy to set up | Race conditions if sync takes longer than the interval | Only if sync interval is long (>5 min) and sync is fast (<10 sec) |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Git remote (GitHub/GitLab) | Using HTTPS with token that expires | Use SSH keys for unattended auto-sync |
| `launchd` (macOS) | Not setting `PATH` in plist -- `git` and `node` not found | Use `EnvironmentVariables` in plist or absolute paths to binaries |
| `systemd` (Linux) | Using system unit instead of user unit | Use `systemctl --user` so it runs as the logged-in user with correct `$HOME` |
| `cron` (Linux) | Cron environment lacks user's PATH and SSH agent | Source `.bashrc` or explicitly set PATH and `SSH_AUTH_SOCK` in crontab |
| Claude Code updates | New directories/files appear in `~/.claude` after update | Allowlist approach handles this gracefully -- new unknowns are ignored by default |
| `~/.claude.json` | Syncing the whole file including runtime state | Extract only the `mcpServers` key if needed, leave the rest local |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Syncing `projects/` directory (964 MB+) | Clone takes minutes, push takes minutes, repo size explodes | Allowlist excludes `projects/` | Immediately on first sync if included |
| Full `git log` parsing on every sync | Sync daemon hangs or uses high CPU | Use `git log -1` or `git rev-parse HEAD` for quick checks | At ~1000 commits |
| Watching entire `~/.claude` with inotify/FSEvents | Thousands of watch events per session from debug/telemetry writes | Only watch allowlisted paths | Immediately -- Claude Code writes to debug/telemetry constantly |
| No debounce on file watcher triggers | Every keystroke in CLAUDE.md triggers a sync commit | Debounce with 30-60 second cooldown after last change | During active editing sessions |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Syncing `~/.claude/.credentials.json` (Linux/Windows) | API credentials pushed to git remote -- full account compromise | Allowlist approach excludes credentials. Additionally, add `.credentials.json` to `.gitignore` as defense-in-depth |
| Making sync repo public on GitHub | All Claude Code settings, custom prompts, and agent instructions exposed | Default to private repo. Warn during setup if repo is public |
| Storing git remote credentials in sync config | Credentials to the sync repo itself get synced recursively | Store git remote auth in system credential store (macOS Keychain, Linux secret-service), never in the sync repo |
| Not validating incoming config before applying | Malicious or corrupted config could inject commands via hooks | Validate JSON syntax before applying. Consider a `--dry-run` apply mode |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No feedback on sync status | User doesn't know if sync is working, broken, or stale | Provide `claude-sync status` showing last sync time, direction, and any errors |
| Requiring manual intervention on conflict | Breaks the "zero effort" promise, user gets frustrated | Auto-resolve with last-writer-wins + backup, log the event, never block |
| Complex initial setup | User gives up before first sync | One-command setup: `claude-sync init <git-url>` handles clone, allowlist, daemon registration |
| No way to see what will sync before it does | User accidentally syncs something they didn't intend | Provide `claude-sync diff` to preview pending changes |
| Silent failures | Sync stops working, user discovers weeks later when machines diverge | Health check with optional desktop notification on failure |

## "Looks Done But Isn't" Checklist

- [ ] **Path rewriting:** Settings.json hooks reference `~/.claude/hooks/*` with absolute paths -- verify these are rewritten on apply and un-rewritten on commit
- [ ] **Cross-platform newlines:** Verify `.gitattributes` forces LF -- run `file *.sh` on Linux after syncing from Windows
- [ ] **Allowlist coverage:** After a Claude Code update, check if new directories appeared in `~/.claude` that need to be added to or excluded from the allowlist
- [ ] **Daemon persistence:** Reboot the machine and verify auto-sync restarts without manual intervention
- [ ] **Empty repo clone:** Test initial setup on a machine with no existing `~/.claude` directory -- does it create the directory structure correctly?
- [ ] **Existing config merge:** Test initial setup on a machine WITH existing `~/.claude` config -- does it merge without data loss?
- [ ] **Auth persistence:** Wait 24+ hours and verify auto-sync still pushes (tokens haven't expired, SSH agent still loaded)
- [ ] **Concurrent edit:** Edit `settings.json` on two machines within the sync interval -- verify no data loss and no broken state
- [ ] **Large file guard:** Create a 50 MB file in `~/.claude/agents/` -- verify the sync rejects it rather than committing it
- [ ] **Plugin dependencies:** Sync to a clean machine -- verify `package.json` dependencies are installed (or user is prompted to install them)

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Synced machine-local state (bloated repo) | HIGH | `git filter-branch` or `git filter-repo` to remove large files from history. Reclone on all machines. Better: start fresh with a new repo and correct allowlist |
| Hardcoded paths broke config | LOW | Run path rewriting manually or re-run setup. Config files are small and recoverable |
| Merge conflict blocks auto-sync | MEDIUM | `git stash`, `git pull --rebase`, `git stash pop`, manually resolve. Or: backup local, `git reset --hard origin/main`, reapply local changes |
| Credentials committed to repo | HIGH | Rotate the exposed credentials immediately. `git filter-repo` to remove from history. Force-push. All machines reclone. If repo was public, assume full compromise |
| Daemon stopped running | LOW | Re-run setup or `claude-sync restart`. Check logs for root cause |
| Line ending corruption | LOW | `git add --renormalize .` after adding `.gitattributes`. Force-push to normalize |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Syncing machine-local state | Phase 1: Core Sync | Repo size < 1 MB after initial sync. No `projects/`, `debug/`, `telemetry/` in git |
| Hardcoded absolute paths | Phase 1: Core Sync | `grep -r "/Users/" repo` and `grep -r "/home/" repo` return zero matches |
| Merge conflicts on auto-sync | Phase 1: Core Sync (strategy), Phase 2: Reliability (edge cases) | Edit same file on two machines within 1 minute, verify both changes preserved or backup created |
| `~/.claude.json` trap | Phase 1: Core Sync (scope decision) | `~/.claude.json` does NOT appear in git tracked files |
| Symlink failure on WSL | Phase 1: Core Sync (architecture) | Run full sync cycle on WSL machine, verify all files accessible |
| Line ending corruption | Phase 1: Core Sync (repo init) | `.gitattributes` is first commit. `file` command shows LF on all platforms |
| Non-idempotent setup | Phase 1: Setup | Run setup script twice in succession without error |
| Silent daemon failure | Phase 2: Reliability | Kill daemon, verify it restarts. Check `claude-sync status` reports issue |
| Git auth expiry | Phase 1: Setup (verify), Phase 2: Reliability (recovery) | `claude-sync status` warns when auth is broken |
| Plugin dependency mismatch | Phase 2: Cross-platform | Sync to clean machine, verify hook execution |
| Git history bloat | Phase 1: Core Sync | Pre-commit hook rejects files > 100 KB |
| CLAUDE.md conflict churn | Phase 2: UX | CLAUDE.md changes < 1x/week in git log |

## Sources

- [Arch Wiki - Dotfiles](https://wiki.archlinux.org/title/Dotfiles) -- Canonical reference on dotfile management approaches
- [Why use chezmoi?](https://www.chezmoi.io/why-use-chezmoi/) -- Problems with bare git repos and symlink managers
- [chezmoi comparison table](https://www.chezmoi.io/comparison-table/) -- Feature matrix of dotfile managers
- [Trail of Bits - Why Windows can't follow WSL symlinks](https://blog.trailofbits.com/2024/02/12/why-windows-cant-follow-wsl-symlinks/) -- Deep dive on symlink incompatibility
- [CRLF vs LF - Normalizing Line Endings in Git](https://www.aleksandrhovhannisyan.com/blog/crlf-vs-lf-normalizing-line-endings-in-git/) -- Line ending configuration
- [GitHub Docs - Configuring Git to handle line endings](https://docs.github.com/en/get-started/git-basics/configuring-git-to-handle-line-endings) -- Official .gitattributes guidance
- [dotfiles-auto-sync (yadm + LaunchAgent)](https://github.com/5h3rr1ll/dotfiles-auto-sync) -- Reference implementation of automated sync
- [git-auto-sync](https://github.com/crackleware/git-auto-sync) -- Conflict resolution via variant files
- [Automated Syncing with Git](https://www.worthe-it.co.za/blog/2016-08-13-automated-syncing-with-git.html) -- Practical experience with cron-based auto-sync
- [Inventive HQ - Claude Code Configuration Files](https://inventivehq.com/knowledge-base/claude/where-configuration-files-are-stored) -- ~/.claude directory structure reference
- [Claude Code Settings Docs](https://code.claude.com/docs/en/settings) -- Official settings documentation
- Direct examination of `~/.claude/` on macOS (2026-03-08) -- actual directory structure, file sizes, and content analysis

---
*Pitfalls research for: Claude Config Sync -- dotfile/config sync for ~/.claude*
*Researched: 2026-03-08*
