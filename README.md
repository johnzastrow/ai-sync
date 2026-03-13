# ai-sync

Git-backed sync for AI tool configuration across macOS, Linux, and Windows/WSL.

Keeps your skills, commands, hooks, settings, and CLAUDE.md identical on every machine — no manual copying. Supports both **Claude Code** (`~/.claude`) and **OpenCode** (`~/.config/opencode/`).

## Why

`~/.claude` is 1.6GB but only ~15MB is your actual config. Generic dotfile managers (chezmoi, yadm) don't know which files matter. ai-sync ships with an opinionated allowlist, rewrites hardcoded paths for cross-platform portability, and backs up your config before every pull.

## Install

### One-liner (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/berlinguyinca/claude-sync/main/install.sh | bash
```

The installer will:
1. Clone, build, and link the `ai-sync` binary
2. Ask which environments to sync (Claude Code, OpenCode, or both)
3. Ask for a GitHub repo name (default: `ai-config`) and visibility
4. Create the repo via `gh`, run `ai-sync init`, and push your config

Run it again to update an existing installation.

Requires: git, [GitHub CLI](https://cli.github.com/) (`gh`) for automatic repo creation. Node.js 22+ is installed automatically if missing (via fnm, nvm, Homebrew, apt, yum, or direct binary download).

### Manual

```bash
git clone https://github.com/berlinguyinca/claude-sync.git
cd claude-sync
npm install
npm run build
npm link

ai-sync init
cd ~/.ai-sync && git remote add origin git@github.com:you/ai-config.git
ai-sync push
```

### Migrating from claude-sync

If you previously used `claude-sync`, the installer automatically:
- Renames `~/.claude-sync-cli` to `~/.ai-sync-cli`
- Renames `~/.claude-sync` to `~/.ai-sync`
- Removes old `claude-sync` symlinks

To migrate your sync repo from flat (v1) to multi-environment (v2) format:

```bash
ai-sync migrate
```

## Quick Start

### First machine (where your config already lives)

The one-liner installer handles everything — init, repo creation, and first push.
If you installed manually, see the manual steps above.

### Every other machine

```bash
# One command — clones the repo and applies config to local directories
ai-sync bootstrap git@github.com:you/ai-config.git
```

Done. Your config is now identical across machines.

### Keeping in sync

```bash
# After changing config on any machine
ai-sync push

# On other machines, pull the changes
ai-sync pull     # backs up current state first

# Check what's changed
ai-sync status
```

## Commands

### `ai-sync init`

Creates a git-backed sync repo at `~/.ai-sync` from your existing config directories.

- Scans enabled environments through their allowlist manifests
- Copies only config files (skips ephemeral data)
- Rewrites absolute paths in `settings.json` / `opencode.json` to portable `{{HOME}}` tokens
- Creates `.gitattributes` enforcing LF line endings
- Makes an initial commit

```bash
ai-sync init                    # default location ~/.ai-sync
ai-sync init --repo-path ~/my-sync  # custom location
ai-sync init --force            # re-initialize existing repo
```

### `ai-sync push`

Scans config directories for changes, copies updated files to the sync repo with path rewriting, commits, and pushes to the remote.

```bash
ai-sync push
ai-sync push -v               # show detailed file changes
```

### `ai-sync pull`

Fetches remote changes and applies them to local config directories. Always creates a timestamped backup first.

```bash
ai-sync pull
ai-sync pull -v               # show detailed file changes
```

### `ai-sync status`

Shows local modifications, remote drift, and excluded file count.

```bash
ai-sync status
ai-sync status -v             # include branch, tracking info, synced file count
```

### `ai-sync bootstrap <repo-url>`

Sets up a new machine from an existing remote sync repo. Clones the repo, applies files to config directories with path expansion, backs up any existing config, and installs skills.

```bash
ai-sync bootstrap git@github.com:you/ai-config.git
ai-sync bootstrap https://github.com/you/ai-config.git
ai-sync bootstrap <url> --force   # re-clone if sync repo exists
```

### `ai-sync update`

Checks for and applies tool updates. ai-sync also checks automatically once every 24 hours on startup (disable with `--no-update-check`).

```bash
ai-sync update
ai-sync update --force        # check even if checked recently
```

### `ai-sync install-skills`

Installs slash commands (like `/sync`) into config directories for all enabled environments. This runs automatically during `init` and `bootstrap`, but you can run it manually after updating.

```bash
ai-sync install-skills
```

### `ai-sync env`

Manage which tool environments are synced.

```bash
ai-sync env list              # show all environments and their status
ai-sync env enable opencode   # enable OpenCode syncing
ai-sync env disable opencode  # disable OpenCode syncing
```

### `ai-sync migrate`

Migrates a v1 (flat, Claude-only) sync repo to v2 (subdirectory, multi-environment) format. This moves all root-level files into a `claude/` subdirectory and writes a `.sync-version` marker.

```bash
ai-sync migrate
```

### The `/sync` skill

After installation, you can type `/sync` inside Claude Code or OpenCode to pull, push, and check status in one step — no need to leave the conversation.

### Global options

```bash
ai-sync --no-update-check <command>   # skip the auto-update check
ai-sync --version                      # show version
ai-sync --help                         # show help
```

## Environments

ai-sync supports multiple AI tool environments:

| Environment | Config Dir | Skills Dir | Path Rewrite |
|-------------|-----------|------------|-------------|
| Claude Code | `~/.claude` | `commands/` | `settings.json` |
| OpenCode | `~/.config/opencode/` | `command/` | `opencode.json` |

By default, only Claude Code is enabled. Use `ai-sync env enable opencode` to add OpenCode support.

### Repo structure

**v1 (legacy, flat):**
```
~/.ai-sync/
├── CLAUDE.md
├── settings.json
├── commands/
└── ...
```

**v2 (multi-environment):**
```
~/.ai-sync/
├── .sync-version          # contains "2"
├── claude/
│   ├── CLAUDE.md
│   ├── settings.json
│   ├── commands/
│   └── ...
└── opencode/
    ├── opencode.json
    ├── settings.json
    ├── command/
    └── ...
```

Use `ai-sync migrate` to move from v1 to v2 format.

## What syncs (and what doesn't)

### Claude Code — Synced (~15MB)

| Path | What it is |
|------|-----------|
| `CLAUDE.md` | Global instructions and preferences |
| `settings.json` | Permissions, hooks, effort level (paths auto-rewritten) |
| `commands/` | Custom slash commands |
| `agents/` | Agent definitions |
| `hooks/` | Hook scripts |
| `get-shit-done/` | GSD framework |
| `package.json` | Dependencies |
| `gsd-file-manifest.json` | Framework state |
| `plugins/blocklist.json` | Plugin blocklist |
| `plugins/known_marketplaces.json` | Marketplace registry |
| `plugins/marketplaces/` | Marketplace configs |

### OpenCode — Synced

| Path | What it is |
|------|-----------|
| `opencode.json` | Main config (paths auto-rewritten) |
| `settings.json` | Settings |
| `agents/` | Agent definitions |
| `command/` | Custom slash commands (singular!) |
| `hooks/` | Hook scripts |
| `get-shit-done/` | GSD framework |
| `package.json` | Dependencies |
| `gsd-file-manifest.json` | Framework state |

### Claude Code — Excluded (machine-local — ~1.6GB)

`projects/`, `history.jsonl`, `debug/`, `telemetry/`, `session-env/`, `shell-snapshots/`, `statsig/`, `file-history/`, `todos/`, `plans/`, `paste-cache/`, `ide/`, `cache/`, `backups/`, `downloads/`, `tasks/`, `plugins/install-counts-cache.json`

These are session data, caches, and logs that regenerate automatically and would cause constant merge conflicts.

## Path portability

`settings.json` and `opencode.json` contain absolute paths like `/Users/you/.claude/hooks/my-hook.js` that break on other machines. ai-sync handles this transparently:

- **On push/init:** Rewrites `/Users/you` to `{{HOME}}` in the sync repo
- **On pull/bootstrap:** Expands `{{HOME}}` back to the local machine's home directory
- **Windows support:** Handles both forward-slash and backslash path variants, including JSON-escaped `\\` sequences

You never see the tokens — they exist only in the git repo.

## Safety

- **Backup before pull/bootstrap:** Current config state is saved to a timestamped directory in `~/.ai-sync-backups/` before any destructive operation
- **Line endings:** `.gitattributes` enforces LF everywhere — hook scripts won't break when synced from macOS to Linux
- **Clear errors:** Every operation reports user-friendly success/failure messages. No raw stack traces for expected errors (missing remote, auth failure, etc.)
- **No secrets:** The allowlist excludes everything except config files. No credentials, tokens, or session data are synced.

## How it works

```
~/.claude (1.6GB)                    ~/.ai-sync (git repo)
├── CLAUDE.md          ──sync──►     ├── .sync-version
├── settings.json      ──rewrite──►  ├── claude/
├── commands/          ──sync──►     │   ├── CLAUDE.md
├── agents/            ──sync──►     │   ├── settings.json ({{HOME}} tokens)
├── hooks/             ──sync──►     │   ├── commands/
├── projects/          ✗ excluded    │   └── ...
├── history.jsonl      ✗ excluded    ├── opencode/
├── debug/             ✗ excluded    │   ├── opencode.json ({{HOME}} tokens)
├── telemetry/         ✗ excluded    │   ├── command/
└── ... (16 more)      ✗ excluded    │   └── ...
                                     ├── .gitattributes
                                     └── .git/ → remote
```

The sync repo is a standard git repository. You can inspect it, view history, and resolve conflicts with normal git tools.

## Development

```bash
git clone https://github.com/berlinguyinca/claude-sync.git
cd claude-sync
npm install

# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint

# Build
npm run build
```

### Project structure

```
src/
├── cli/
│   ├── index.ts              # Commander.js entry point
│   ├── format.ts             # Colored output formatting
│   └── commands/
│       ├── init.ts           # ai-sync init
│       ├── push.ts           # ai-sync push
│       ├── pull.ts           # ai-sync pull
│       ├── status.ts         # ai-sync status
│       ├── bootstrap.ts      # ai-sync bootstrap
│       ├── update.ts         # ai-sync update
│       ├── install-skills.ts # ai-sync install-skills
│       ├── env.ts            # ai-sync env list|enable|disable
│       └── migrate.ts        # ai-sync migrate
├── core/
│   ├── manifest.ts           # Allowlist of sync targets
│   ├── scanner.ts            # Directory scanner filtered by manifest
│   ├── path-rewriter.ts      # {{HOME}} token rewriting
│   ├── backup.ts             # Timestamped backup creation
│   ├── sync-engine.ts        # Push/pull/status orchestration
│   ├── updater.ts            # Auto-update mechanism
│   ├── skills.ts             # Skill installation (/sync command)
│   ├── environment.ts        # Environment definitions (Claude, OpenCode)
│   ├── env-config.ts         # Per-machine environment preferences
│   └── migration.ts          # v1→v2 repo migration
├── git/
│   └── repo.ts               # Git operations wrapper (simple-git)
├── platform/
│   └── paths.ts              # Cross-platform path resolution
└── index.ts                  # Library exports

skills/
├── sync.md                   # /sync slash command
└── opencode-sync.md          # /sync for OpenCode
```

## License

MIT
