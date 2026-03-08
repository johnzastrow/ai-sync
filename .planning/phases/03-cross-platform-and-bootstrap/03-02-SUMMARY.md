---
phase: 03-cross-platform-and-bootstrap
plan: 02
subsystem: cli
tags: [bootstrap, git-clone, simple-git, commander, cli]

requires:
  - phase: 03-01
    provides: "Cross-platform path normalization (normalizePath, expandPathsForLocal)"
  - phase: 01-02
    provides: "handleInit pattern, scanDirectory, path-rewriter, backup"
provides:
  - "handleBootstrap function for cloning remote repos and applying config"
  - "registerBootstrapCommand CLI registration"
  - "BootstrapOptions and BootstrapResult types"
affects: []

tech-stack:
  added: []
  patterns: ["handleX/registerXCommand CLI pattern for bootstrap"]

key-files:
  created:
    - src/cli/commands/bootstrap.ts
    - tests/commands/bootstrap.test.ts
  modified:
    - src/cli/index.ts
    - src/index.ts

key-decisions:
  - "Derived homeDir from claudeDir parent (path.dirname) for path expansion consistency with init/pull"
  - "Used scanDirectory on both sync repo and existing claudeDir for consistent allowlisting"
  - "Backup stored in .claude-sync-backups alongside sync repo directory"

patterns-established:
  - "Bootstrap as inverse of init: clone remote then apply files locally"

requirements-completed: [SETUP-01]

duration: 3min
completed: 2026-03-08
---

# Phase 3 Plan 2: Bootstrap Command Summary

**Bootstrap CLI command that clones a remote sync repo and applies config files to ~/.claude with path expansion, backup, and --force support**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-08T20:51:01Z
- **Completed:** 2026-03-08T20:53:38Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- handleBootstrap clones remote repo, applies files with {{HOME}} path expansion on settings.json
- Automatic backup of existing ~/.claude config before overwriting
- Error guarding if sync repo already exists (with --force override to re-clone)
- Clone errors wrapped with actionable "check your repository URL" messages
- 8 integration tests covering clone, apply, backup, force, error, and count scenarios

## Task Commits

Each task was committed atomically:

1. **Task 1: Create bootstrap command handler with tests (TDD)** - `76813ce` (feat)
2. **Task 2: Register bootstrap command in CLI and update exports** - `e1e21b1` (feat)

_Note: Task 1 used TDD (RED then GREEN in single commit since module import error served as RED confirmation)_

## Files Created/Modified
- `src/cli/commands/bootstrap.ts` - handleBootstrap and registerBootstrapCommand following established pattern
- `tests/commands/bootstrap.test.ts` - 8 integration tests using real temp directories and local git repos
- `src/cli/index.ts` - Import and register bootstrap command
- `src/index.ts` - Re-export handleBootstrap, BootstrapOptions, BootstrapResult

## Decisions Made
- Derived homeDir from claudeDir parent (path.dirname) for path expansion -- consistent with init and pull commands
- Used scanDirectory on both sync repo and existing claudeDir for consistent allowlisting behavior
- Backup stored in .claude-sync-backups alongside sync repo directory -- same as pull command

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All v1 plans complete (6/6 across 3 phases)
- claude-sync has full init, push, pull, status, and bootstrap CLI commands
- Cross-platform path normalization handles Windows and Unix paths

---
*Phase: 03-cross-platform-and-bootstrap*
*Completed: 2026-03-08*
