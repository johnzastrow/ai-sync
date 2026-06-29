# Pull & tool provisioning — how it works

This document explains what `ai-sync pull` actually does, step by step, and how
the optional **tool provisioning** stage behaves. It complements the command
reference in [`README.md`](../README.md#ai-sync-pull).

## The pull pipeline

`ai-sync pull` runs these stages in order (see `src/core/sync-engine.ts`):

1. **Fetch** the sync repo from its remote (`git fetch`), and detect the repo
   format version (v1 flat / v2 multi-env / v3 fragments).
2. **Backup** the current local config to a timestamped directory under
   `~/.ai-sync-backups/<ISO-timestamp>/` *before* anything is written. Every
   pull does this, so a bad pull is always recoverable.
3. **Apply file changes** for each enabled environment (e.g. `claude`,
   `opencode`):
   - files present in the repo but missing locally are **added**;
   - files that differ are **modified**;
   - files removed in the repo are **deleted** locally.
   - **Locally-modified files are preserved** by default. A file changed on
     both sides becomes a *conflict* (local copy kept) unless you pass
     `--force` (overwrite local) or resolve it via the
     [AI-assisted merge](../README.md#ai-assisted-merge) flow.
4. **Provision tools** (optional — see below), unless `--dry-run` or
   `--no-provision` is set.
5. **Write a report** (only if `--report [file]` is given): a markdown
   before/after summary of everything the sync added / modified / deleted.

### Useful flags

```bash
ai-sync pull -n           # dry run: show what would change, write nothing
ai-sync pull -v           # verbose: per-file changes and stage logging
ai-sync pull --force      # overwrite locally-modified files instead of preserving
ai-sync pull --no-provision   # skip the provisioning stage entirely
ai-sync pull --report out.md  # also write a before/after markdown report
ai-sync pull --env claude     # only pull a single environment
```

> `--report` is **not** a preview. It documents a *real* sync. To preview
> without changing anything, combine it with `--dry-run`:
> `ai-sync pull --dry-run --report preview.md`.

## Tool provisioning

Provisioning is the stage that tries to (re)install the external CLIs your
config depends on (MCP server commands, hook binaries, pip/cargo/npm tools) so
a freshly-synced machine actually has them. It is deliberately conservative and
**inert unless explicitly armed**.

### It is manifest-gated

On pull, provisioning reads `<sync-repo>/tools/manifest.json`
(`~/.ai-sync/tools/manifest.json`). If that file does **not** exist, the read
throws `ENOENT`, the error is swallowed, and provisioning is **skipped**:

```
[verbose] Provisioning skipped: ENOENT: no such file or directory,
          open '/home/jcz/.ai-sync/tools/manifest.json'
```

So with no manifest in the sync repo, pull never installs anything.

### Where the manifest comes from

The manifest is written by `ai-sync push`, not by hand. During push,
`discoverTools()` scans the local config and records the tools it finds:

- **MCP servers** — the `command` of each entry under `mcpServers` in
  `settings.json`.
- **Hook binaries** — leading binary names in files under `hooks/`
  (shell keywords like `if`/`for`/`echo` are filtered out).
- **Plugins** — entries in `plugins/installed_plugins.json`.
- **pip tools** — verified with `pip show <pkg>`.
- **cargo tools** — discovered via `cargo install --list`.

Push writes the manifest with **`autoInstall: false` hardcoded**
(`src/core/sync-engine.ts`), which is the key safety property below.

### What `provision()` does with the manifest

`provision()` (`src/core/provisioner.ts`) behaves by tool `type`:

| `type`         | install command                | auto-installable? |
| -------------- | ------------------------------ | ----------------- |
| `pip`          | `pip install <pkg>`            | yes               |
| `cargo`        | `cargo install <pkg>`          | yes               |
| `npm`          | `npm install -g <pkg>`         | yes               |
| `claude-plugin`| (via plugin marketplace)       | no — logged only  |
| `system`       | (install manually)             | no — logged only  |

The decisive branch:

- **`autoInstall: false`** (the default, since push hardcodes it) → `provision()`
  collects the install commands and returns them **without executing anything**.
  Nothing is installed.
- **`autoInstall: true`** → it runs a preflight (`which pip|cargo|npm`), then an
  install loop: for each tool `installTool()` then `verifyTool()`. If any
  install fails, it **rolls back** by uninstalling what it just added (reverse
  order).

Because the manifest is written with `autoInstall: false`, the normal pull path
never executes installs even when a manifest is present.

### Note: a long first pull is bulk I/O, not a provisioning hang

The first pull on a machine that is far behind can take a while — it backs up
the existing `~/.claude` tree and writes a large number of new files (hundreds,
including binary assets such as fonts). This is normal I/O progress, **not** a
provisioning stall: provisioning runs after the file copy and, per the above, is
skipped (no manifest) or no-ops (`autoInstall: false`). Installs are the only
potentially slow part (`cargo install` compiles from source and has no
timeout), and they only run if a manifest explicitly sets `autoInstall: true`.

If you ever want provisioning fully out of the picture, pass `--no-provision`.
