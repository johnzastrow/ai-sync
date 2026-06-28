# Setting up ai-sync on additional machines

A runbook for bringing a second/third machine (macOS / Linux / Windows) in line
with an existing sync setup: install the tool, pull the shared config, and
optionally enable an auto-push snapshot.

> **Order matters: install/update the tool _before_ you pull or push.** Older
> builds synced `plugins/cache/`; pushing with one would re-add machine-local
> cache that newer builds deliberately exclude.

Replace `<config-repo-url>` below with your sync repo (e.g.
`https://github.com/<you>/myai-config.git`).

---

## 1. Install (or update) the `ai-sync` tool

```bash
# First time on this machine:
git clone https://github.com/<you>/ai-sync.git ~/Github/ai-sync
# (already cloned:)  cd ~/Github/ai-sync && git checkout main && git pull

cd ~/Github/ai-sync
npm install
npm run build
npm install -g .

# Verify the build is current — this flag exists only on recent builds:
ai-sync push --help | grep -- --no-backup
```

## 2. Status check (read-only, safe)

```bash
ai-sync status
```

- No sync repo yet? Bootstrap this machine from the shared repo:
  ```bash
  ai-sync bootstrap <config-repo-url>
  ```
- Otherwise, note any `local-only` / `both-changed` items — those are local
  edits the next step preserves.

## 3. Pull the shared config

```bash
ai-sync pull
```

`pull` backs up the config dir first (to `~/.ai-sync-backups/<timestamp>/`),
updates the local sync repo, and applies remote changes while keeping local
edits (3-way merge).

## 4. Resolve `CLAUDE.md` if it didn't update

If your machine had local `CLAUDE.md` edits, the 3-way merge keeps the local
copy and the shared version is **not** applied automatically. To take the
canonical shared version for just that file (it was already pulled into the
sync repo):

```bash
cp ~/.ai-sync/claude/CLAUDE.md ~/.claude/CLAUDE.md
```

## 5. Push this machine's config

```bash
ai-sync push
```

Publishes this machine's settings and plugin *declarations*. Plugin cache/data
are excluded, so they are never pushed.

## 6. (Optional) Hourly auto-push snapshot

A scheduled push captures every change to the remote within the hour
(recoverable via git history).

**Windows** — a Scheduled Task running a PowerShell script.

**macOS / Linux** — a cron job. Create the script:

```bash
mkdir -p ~/.ai-sync-auto
cat > ~/.ai-sync-auto/auto-push.sh <<'EOF'
#!/usr/bin/env bash
# Hourly snapshot of local AI config to the remote.
# Skips when the local sync repo is behind (reconcile/pull first).
set -uo pipefail
log=~/.ai-sync-auto/auto-push.log
repo=~/.ai-sync
stamp=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$stamp] auto-push start" >> "$log"
git -C "$repo" fetch --quiet 2>/dev/null || true
behind=$(git -C "$repo" rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
if [ "${behind:-0}" -gt 0 ]; then
  echo "[$stamp] remote is $behind ahead; skipping push (run 'ai-sync pull')" >> "$log"
  exit 0
fi
ai-sync push --no-backup >> "$log" 2>&1
echo "[$stamp] done (exit $?)" >> "$log"
tail -n 500 "$log" > "$log.tmp" && mv "$log.tmp" "$log"
EOF
chmod +x ~/.ai-sync-auto/auto-push.sh

# Hourly cron entry:
( crontab -l 2>/dev/null; echo "0 * * * * \$HOME/.ai-sync-auto/auto-push.sh" ) | crontab -
```

`--no-backup` is used here because the frequent remote push is itself the
snapshot; a local pre-push backup each hour would just churn.

## 7. Verify

```bash
ai-sync status        # expect: "Everything is in sync"
```

---

## Notes & gotchas

- **Dev safety:** never run a dev/unbuilt `ai-sync` against your real
  `~/.ai-sync`. Set `AI_SYNC_DEV=1` in your dev shell and pass `--repo-path`
  pointing at a throwaway directory. See [Development safety](../CLAUDE.md).
- **Plugin cache is machine-local.** Each machine re-downloads plugins from the
  marketplace; only the declarations (`installed_plugins.json`,
  `known_marketplaces.json`, `marketplaces/`) sync.
- **`--report`:** `ai-sync pull --report` (or `push --report`) writes a markdown
  before/after report of a sync if you want a record.
- **Recovery:** `pull` backs up the config dir before applying changes; a bad
  push is recoverable from the sync repo's git history.
