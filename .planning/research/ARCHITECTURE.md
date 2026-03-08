# Architecture Research

**Domain:** Dotfile/config sync tool (Git-backed `~/.claude` synchronization)
**Researched:** 2026-03-08
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CLI Interface                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐     │
│  │  init    │  │  status  │  │  diff    │  │  sync (manual)  │     │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘     │
│       │              │             │                  │               │
├───────┴──────────────┴─────────────┴──────────────────┴───────────────┤
│                        Sync Engine                                    │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐      │
│  │  File      │  │  State       │  │  Conflict Resolution   │      │
│  │  Scanner   │  │  Differ      │  │  (last-write-wins)     │      │
│  └──────┬──────┘  └──────┬───────┘  └───────────┬─────────────┘      │
│         │                │                      │                    │
├─────────┴────────────────┴──────────────────────┴────────────────────┤
│                        Git Operations                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐         │
│  │  add     │  │  commit  │  │  pull    │  │  push        │         │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘         │
├──────────────────────────────────────────────────────────────────────┤
│                        File System Layer                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐      │
│  │  Watcher         │  │  Filter/Ignore   │  │  Path Resolver │      │
│  │  (chokidar)      │  │  (.gitignore)    │  │  (cross-plat)  │      │
│  └──────────────────┘  └──────────────────┘  └────────────────┘      │
├──────────────────────────────────────────────────────────────────────┤
│                        Storage                                       │
│  ┌───────────────────────┐  ┌───────────────────────────────┐        │
│  │  ~/.claude (target)   │  │  Git repo (source of truth)   │        │
│  └───────────────────────┘  └───────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| CLI Interface | User-facing commands (init, status, sync, diff) | Commander.js or yargs with subcommands |
| Sync Engine | Orchestrates the detect-diff-apply cycle | Core module coordinating scanner, differ, resolver |
| File Scanner | Discovers which files in `~/.claude` should be tracked | Glob-based directory walker with ignore rules |
| State Differ | Compares local files to git repo state | SHA256 hashing, git diff output parsing |
| Conflict Resolution | Handles divergent edits from multiple machines | Last-write-wins by timestamp (no per-machine overrides needed) |
| Git Operations | Programmatic git add/commit/pull/push | `simple-git` npm package wrapping git CLI |
| File Watcher | Detects changes for automatic sync | `chokidar` for cross-platform fs events |
| Filter/Ignore | Determines what to sync vs. skip | `.gitignore`-style pattern matching |
| Path Resolver | Normalizes paths across macOS/Linux/WSL | `path` module with explicit forward-slash normalization |

## Recommended Project Structure

```
src/
├── cli/                    # CLI entry point and commands
│   ├── index.ts            # Main CLI entry, command registration
│   ├── commands/
│   │   ├── init.ts         # First-time setup on a machine
│   │   ├── sync.ts         # Manual sync trigger
│   │   ├── status.ts       # Show sync state
│   │   └── diff.ts         # Show what would change
│   └── output.ts           # Terminal output formatting
├── core/                   # Sync engine (business logic)
│   ├── sync-engine.ts      # Orchestrator: pull -> detect -> commit -> push
│   ├── scanner.ts          # Walk ~/.claude, apply ignore rules, hash files
│   ├── differ.ts           # Compare local state to repo state
│   ├── resolver.ts         # Conflict resolution strategy
│   └── filter.ts           # Ignore patterns (cache, telemetry, etc.)
├── git/                    # Git abstraction layer
│   ├── operations.ts       # add, commit, pull, push, clone
│   ├── repo.ts             # Repository management (init, clone, remote)
│   └── merge.ts            # Pull/merge conflict handling
├── watcher/                # File system monitoring
│   ├── watcher.ts          # Chokidar-based file watcher
│   ├── debouncer.ts        # Batch rapid changes, avoid sync storms
│   └── daemon.ts           # Background process management
├── platform/               # Cross-platform abstractions
│   ├── paths.ts            # OS-specific path resolution
│   ├── home.ts             # Home directory detection (incl. WSL)
│   └── process.ts          # Daemon/background process (launchd, systemd, Task Scheduler)
├── config/                 # Tool's own configuration
│   ├── schema.ts           # Config file types/validation
│   └── defaults.ts         # Default ignore patterns, sync interval, etc.
└── index.ts                # Library entry point
```

### Structure Rationale

- **cli/:** Separated from core logic so the sync engine can be tested and used independently. Commands are thin wrappers that call core functions.
- **core/:** The sync engine is the heart of the tool. Each concern (scanning, diffing, resolving, filtering) is a separate module because they change for different reasons and need individual testing.
- **git/:** Abstracted behind its own layer because: (1) the git library choice may change (simple-git vs. direct CLI), (2) git operations need retry logic and error handling that shouldn't pollute business logic, (3) makes testing possible with a mock git layer.
- **watcher/:** Isolated because the daemon/background process is the most platform-dependent part and needs independent lifecycle management.
- **platform/:** Cross-platform concerns collected in one place. When a WSL-specific path bug surfaces, you fix it here, not scattered across the codebase.

## Architectural Patterns

### Pattern 1: Source of Truth + Apply

**What:** The git repository is the single source of truth. The local `~/.claude` directory is a "working copy" that gets reconciled against it. This is the pattern chezmoi established and it is the right one for this domain.

**When to use:** Always -- this is the foundational pattern for the entire tool.

**Trade-offs:**
- Pro: Clear mental model, git history provides rollback, conflicts are detectable
- Con: Requires a sync step (even if automated), slight complexity vs. bare repo approach

**Why not bare repo:** A bare git repo tracking the home directory (the yadm approach) is simpler in concept but has drawbacks for this use case: (1) `~/.claude` contains huge ephemeral directories (projects/ at 964MB, debug/ at 380MB, telemetry/ at 134MB) that must be gitignored, and the bare repo approach makes gitignore management awkward when the working tree is the home directory. (2) The tool needs to watch and auto-sync, which is easier when the repo is separate from the target directory.

**Implementation:**
```typescript
// Core sync cycle
async function sync(config: SyncConfig): Promise<SyncResult> {
  const repo = await GitRepo.open(config.repoPath);

  // 1. Pull remote changes first
  const pullResult = await repo.pull();

  // 2. Apply remote changes to ~/.claude
  if (pullResult.hasChanges) {
    await applyToTarget(repo, config.targetPath);
  }

  // 3. Scan ~/.claude for local changes
  const localChanges = await scanForChanges(config.targetPath, repo);

  // 4. Commit and push local changes
  if (localChanges.length > 0) {
    await repo.addAndCommit(localChanges);
    await repo.push();
  }

  return { pulled: pullResult, pushed: localChanges };
}
```

### Pattern 2: Debounced Watch-and-Sync

**What:** File system watcher detects changes, debounces rapid edits (e.g., a plugin install writing 50 files), then triggers a sync cycle.

**When to use:** For the automatic sync requirement. The watcher runs as a background daemon.

**Trade-offs:**
- Pro: Zero manual intervention after setup, changes propagate within seconds
- Con: Background process must be reliable, needs proper debouncing to avoid git contention

**Implementation:**
```typescript
// Debounced watcher
const DEBOUNCE_MS = 2000; // Wait 2s after last change before syncing

function createWatcher(config: SyncConfig): chokidar.FSWatcher {
  let timer: NodeJS.Timeout | null = null;

  const watcher = chokidar.watch(config.targetPath, {
    ignored: config.ignorePatterns,
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on('all', (event, path) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => sync(config), DEBOUNCE_MS);
  });

  return watcher;
}
```

### Pattern 3: Pull-Before-Push Sync Order

**What:** Always pull remote changes before pushing local changes. This prevents divergent histories and minimizes merge conflicts.

**When to use:** Every sync cycle, without exception.

**Trade-offs:**
- Pro: Prevents force-push disasters, ensures all machines converge
- Con: Requires handling the case where pull introduces conflicts with local uncommitted changes

**Critical detail:** The sync must stash local changes, pull, pop stash, then commit and push. If a conflict arises during stash pop, the last-write-wins strategy applies (since per-machine overrides are explicitly out of scope).

```typescript
async function syncWithConflictHandling(repo: GitRepo): Promise<void> {
  const hasLocalChanges = await repo.hasUncommittedChanges();

  if (hasLocalChanges) {
    await repo.stash();
  }

  await repo.pull({ rebase: true });

  if (hasLocalChanges) {
    try {
      await repo.stashPop();
    } catch (conflict) {
      // Last-write-wins: local changes take precedence
      await repo.checkoutOurs();
      await repo.addAll();
    }
  }
}
```

## Data Flow

### Sync Cycle Flow (Automatic)

```
[File Change in ~/.claude]
    |
    v
[Watcher (chokidar)] ──(debounce 2s)──> [Sync Engine]
                                              |
                                    ┌─────────┴─────────┐
                                    v                     v
                              [Pull Remote]          [Scan Local]
                                    |                     |
                                    v                     v
                              [Apply to ~/]          [Stage Changes]
                                    |                     |
                                    v                     v
                              [Detect Conflicts]    [Commit]
                                    |                     |
                                    v                     v
                              [Auto-resolve]         [Push]
                                    |                     |
                                    └─────────┬───────────┘
                                              v
                                        [Log Result]
```

### Init Flow (First-Time Setup)

```
[User runs `claude-sync init`]
    |
    v
[Prompt for git remote URL]
    |
    ├── Remote exists?
    │       YES ──> [Clone repo to sync dir]
    │                   |
    │                   v
    │               [Copy repo contents -> ~/.claude]
    │               (merge with existing local files)
    │
    │       NO ──>  [Init new repo in sync dir]
    │                   |
    │                   v
    │               [Copy ~/.claude -> repo]
    │               [Commit initial state]
    │               [Set remote, push]
    |
    v
[Install watcher daemon]
    |
    v
[Start background sync]
```

### Key Data Flows

1. **Outbound sync (local change propagation):** File changed in `~/.claude` -> watcher detects -> debounce -> scanner identifies changed files -> filter applies ignore rules -> git add + commit with auto-message -> pull --rebase -> push to remote

2. **Inbound sync (remote change application):** Periodic pull (or triggered by outbound sync) -> git detects remote changes -> changed files copied from repo to `~/.claude` -> file permissions preserved

3. **Conflict resolution:** Pull introduces merge conflict -> auto-resolve with last-write-wins (local changes win, since the most recent edit is what the user wants) -> commit resolution -> push

## What to Sync vs. Ignore

Understanding the `~/.claude` directory structure is critical. Based on analysis of an actual directory:

### SYNC (Config/Skills -- small, user-authored)

| Directory/File | Size | Why Sync |
|---------------|------|----------|
| `agents/` | 256K | User-authored agent definitions |
| `commands/` | 136K | Custom slash commands |
| `hooks/` | 20K | Hook scripts |
| `get-shit-done/` | 1MB | Plugin/framework files |
| `settings.json` | <1K | User preferences |
| `CLAUDE.md` | <1K | Global instructions |
| `package.json` | <1K | Package metadata |

### IGNORE (Ephemeral/Machine-specific -- large, auto-generated)

| Directory/File | Size | Why Ignore |
|---------------|------|------------|
| `projects/` | 964MB | Per-project state, machine-specific paths |
| `debug/` | 380MB | Debug logs, ephemeral |
| `telemetry/` | 134MB | Analytics data, machine-specific |
| `file-history/` | 92MB | File edit history, machine-specific |
| `downloads/` | 71MB | Downloaded files, ephemeral |
| `history.jsonl` | 281K | Conversation history, machine-specific |
| `cache/` | 140K | Cached data, ephemeral |
| `shell-snapshots/` | 200K | Shell state, machine-specific |
| `session-env/` | 0B | Session environment, ephemeral |
| `ide/` | 0B | IDE integration state |
| `paste-cache/` | 40K | Clipboard cache, ephemeral |
| `statsig/` | 36K | Feature flags, machine-specific |
| `backups/` | 120K | Local backups |

### Edge Cases

| Directory | Decision | Rationale |
|-----------|----------|-----------|
| `plugins/` | Sync selectively | Contains both config (sync) and cache (ignore). Sync `marketplaces/` config, ignore `install-counts-cache.json` |
| `plans/` | Sync | User-created planning files |
| `tasks/` | Ignore | Task execution state, machine-specific |
| `todos/` | Ignore | Todo state, machine-specific |

## Scaling Considerations

This tool does not have traditional user-count scaling concerns. It is a local CLI tool syncing via git. The relevant scaling dimensions are:

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-2 machines | Simple pull/push, conflicts are rare |
| 3-5 machines | Debouncing matters more, concurrent push conflicts possible; use pull --rebase |
| 5+ machines | Consider a lock mechanism or sync coordinator; rapid convergence becomes important |

### Scaling Priorities

1. **First bottleneck: Concurrent pushes from multiple machines.** Two machines edit and push simultaneously. Solution: Pull --rebase before every push, retry on push failure (up to 3 attempts with backoff). This handles the 3-5 machine case well.

2. **Second bottleneck: Large files creeping into the repo.** If ignore rules aren't strict enough, large ephemeral files get committed, bloating the repo. Solution: `.gitignore` is configured during `init` and warns if a commit would exceed a size threshold (e.g., 1MB per file).

## Anti-Patterns

### Anti-Pattern 1: Syncing Everything in ~/.claude

**What people do:** Track the entire `~/.claude` directory without ignore rules.
**Why it's wrong:** The directory contains ~1.7GB of ephemeral data (projects, debug, telemetry). Committing this bloats the git repo irreversibly, makes sync slow, and wastes bandwidth. Git is not designed for large binary blobs.
**Do this instead:** Maintain a strict allowlist or denylist. Default to ignoring everything, explicitly opt-in the directories that contain user-authored config (agents, commands, hooks, settings, skills).

### Anti-Pattern 2: Bare Git Repo on Home Directory

**What people do:** Use `git init --bare` with `$HOME` as the work tree (the yadm pattern).
**Why it's wrong for this use case:** (1) Makes it hard to ignore the massive ephemeral directories. (2) Pollutes `git status` with untracked files from the entire home directory if `.gitignore` is imperfect. (3) Background watcher needs to watch all of `$HOME` instead of a specific directory. (4) Risk of accidentally committing sensitive files from home directory.
**Do this instead:** Use a separate sync directory (`~/.claude-sync/` or `~/.local/share/claude-sync/`) as the git repo, and copy/link files between it and `~/.claude`.

### Anti-Pattern 3: Real-Time Sync Without Debouncing

**What people do:** Trigger a git commit+push on every single file change event.
**Why it's wrong:** A plugin install or settings update can generate 20-50 file events in rapid succession. This creates 20-50 meaningless commits, hammers the git remote, and can cause push conflicts with itself.
**Do this instead:** Debounce file events. Wait 2-5 seconds after the last change before triggering a sync cycle. Batch all changes into a single commit.

### Anti-Pattern 4: Manual Push/Pull Workflow

**What people do:** Require users to run explicit push/pull commands (like yadm or chezmoi).
**Why it's wrong for this project:** The explicit requirement is "sync happens without user intervention after initial setup." A manual workflow defeats the core value proposition and means machines drift when the user forgets to sync.
**Do this instead:** Background daemon with file watcher handles everything. Keep manual `sync` command as fallback, but the default mode is automatic.

### Anti-Pattern 5: Symlink-Based Sync

**What people do:** Keep config in a git repo and symlink files into `~/.claude`.
**Why it's wrong:** (1) Claude Code may not follow symlinks consistently. (2) Symlinks behave differently on Windows/WSL vs. macOS/Linux. (3) Adds complexity -- if a tool writes to the symlink target, is the repo updated? Depends on the tool's behavior. (4) Cross-platform symlink support on Windows requires developer mode or admin privileges.
**Do this instead:** Copy files between the repo and `~/.claude`. Use file hashing to detect which direction changes flow.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Git remote (GitHub/GitLab) | SSH or HTTPS auth via git credential helper | User configures during `init`. Tool does not manage credentials. |
| OS daemon system | launchd (macOS), systemd (Linux), Task Scheduler (Windows) | For persistent background watcher. Alternative: run in terminal session. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| CLI <-> Sync Engine | Direct function calls | CLI is a thin shell; engine does the work |
| Sync Engine <-> Git | `simple-git` async API | All git operations are async, return promises |
| Watcher <-> Sync Engine | Debounced event callback | Watcher fires events; debouncer aggregates; then calls sync |
| Sync Engine <-> File System | Node.js `fs/promises` | File copy/hash operations |
| Daemon <-> Watcher | Process lifecycle | Daemon starts/stops the watcher; handles signals |

## Build Order (Dependencies Between Components)

Components should be built in this order because each layer depends on the ones below it:

```
Phase 1: Foundation
├── platform/paths.ts        (no dependencies, needed by everything)
├── config/schema.ts         (no dependencies, defines types)
├── config/defaults.ts       (depends on schema)
└── core/filter.ts           (depends on config for ignore patterns)

Phase 2: Git Layer
├── git/repo.ts              (depends on platform/paths)
├── git/operations.ts        (depends on git/repo)
└── git/merge.ts             (depends on git/operations)

Phase 3: Sync Engine
├── core/scanner.ts          (depends on platform/paths, core/filter)
├── core/differ.ts           (depends on core/scanner, git/operations)
├── core/resolver.ts         (depends on git/merge)
└── core/sync-engine.ts      (depends on scanner, differ, resolver, git/operations)

Phase 4: CLI (Minimum Viable Product)
├── cli/commands/init.ts     (depends on git/repo, core/sync-engine)
├── cli/commands/sync.ts     (depends on core/sync-engine)
├── cli/commands/status.ts   (depends on core/differ)
├── cli/commands/diff.ts     (depends on core/differ)
└── cli/index.ts             (depends on all commands)

Phase 5: Automatic Sync
├── watcher/watcher.ts       (depends on core/filter, chokidar)
├── watcher/debouncer.ts     (depends on watcher)
├── watcher/daemon.ts        (depends on debouncer, core/sync-engine)
└── platform/process.ts      (depends on daemon, OS-specific service mgmt)
```

**Rationale:** The foundation and git layers are pure utilities with no UI or daemon concerns. The sync engine composes them. The CLI makes the sync engine usable. The watcher/daemon layer adds the "automatic" requirement last, because manual sync is a valid intermediate milestone and the hardest part is the daemon lifecycle management across platforms.

## Sources

- [Chezmoi Architecture Documentation](https://www.chezmoi.io/developer-guide/architecture/)
- [Chezmoi Concepts](https://www.chezmoi.io/reference/concepts/)
- [Chezmoi: What Does It Do?](https://www.chezmoi.io/what-does-chezmoi-do/)
- [Chezmoi Comparison Table](https://www.chezmoi.io/comparison-table/)
- [YADM - Yet Another Dotfiles Manager](https://yadm.io/)
- [dotfiles.github.io - Utilities](https://dotfiles.github.io/utilities/)
- [FSWatch + Git: Simple Dropbox Alternative](https://sidia.li/simple-dropbox-alternative/)
- [chokidar - Cross-platform file watcher](https://github.com/paulmillr/chokidar)
- [simple-git - Node.js git wrapper](https://www.npmjs.com/package/simple-git)
- [Git Bare Repository for Dotfiles](https://harfangk.github.io/2016/09/18/manage-dotfiles-with-a-git-bare-repository.html)
- [gitwatch - Auto-commit on file change](https://github.com/gitwatch/gitwatch)
- [git-auto-sync](https://github.com/GitJournal/git-auto-sync)
- [Automatic Git Conflict Resolution](https://a3nm.net/blog/git_auto_conflicts.html)

---
*Architecture research for: Claude Config Sync (~/.claude synchronization)*
*Researched: 2026-03-08*
