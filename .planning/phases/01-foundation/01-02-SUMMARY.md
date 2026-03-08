---
phase: 01-foundation
plan: 02
subsystem: cli
tags: [simple-git, commander, picocolors, git-wrapper, init-command, integration-tests]

# Dependency graph
requires:
  - phase: 01-foundation-01
    provides: "Allowlist manifest, directory scanner, path rewriter, platform paths"
provides:
  - "Git operations wrapper (initRepo, isGitRepo, addFiles, commitFiles, writeGitattributes)"
  - "CLI entry point with Commander.js (claude-sync command)"
  - "Init command creating git-backed sync repo from ~/.claude"
  - "Integration tests proving full init pipeline end-to-end"
affects: [02-01, 02-02]

# Tech tracking
tech-stack:
  added: []
  patterns: [named-import-simple-git, extracted-handler-for-testability, homeDir-derived-from-claudeDir]

key-files:
  created:
    - src/git/repo.ts
    - src/cli/commands/init.ts
    - tests/git/repo.test.ts
    - tests/commands/init.test.ts
  modified:
    - src/cli/index.ts
    - src/index.ts

key-decisions:
  - "Derived homeDir from claudeDir parent instead of os.homedir() for correct path rewriting with custom claudeDir"
  - "Extracted handleInit() from Commander action handler for direct testability without CLI parsing"
  - "Used named import { simpleGit } instead of default import for Node16 module resolution compatibility"

patterns-established:
  - "Handler extraction: CLI commands export a handleX() function for direct testing"
  - "HomeDir derivation: path.dirname(claudeDir) instead of hardcoded os.homedir()"
  - "Init idempotency: check isGitRepo before init, error without --force, clean reinit with --force"

requirements-completed: [SYNC-01, SAFE-02]

# Metrics
duration: 4min
completed: 2026-03-08
---

# Phase 1 Plan 02: Git Wrapper, CLI, and Init Command Summary

**Working `claude-sync init` command with git operations wrapper, allowlist-filtered sync, and {{HOME}} path tokenization in settings.json**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-08T19:46:43Z
- **Completed:** 2026-03-08T19:50:55Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Implemented git operations wrapper (initRepo, isGitRepo, addFiles, commitFiles, writeGitattributes) using simple-git
- Built CLI entry point with Commander.js exposing `claude-sync init` with --force and --repo-path options
- Implemented full init pipeline: create repo, .gitattributes first commit, scan/filter/copy allowed files, rewrite settings.json paths, second commit
- 16 new tests (7 unit + 9 integration) bringing total to 44 tests across 5 files

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing git repo tests** - `1b6b7af` (test)
2. **Task 1 GREEN: Git wrapper, CLI, init command** - `59ec7e7` (feat)
3. **Task 2 RED: Init integration tests** - `de328fc` (test)
4. **Task 2 GREEN: Fix homeDir derivation** - `9cd50df` (fix)

_Note: Both tasks followed TDD with separate test and implementation commits._

## Files Created/Modified
- `src/git/repo.ts` - Git operations wrapper using simple-git (init, isGitRepo, add, commit, writeGitattributes)
- `src/cli/commands/init.ts` - Init command handler with handleInit() and registerInitCommand()
- `src/cli/index.ts` - Commander.js CLI entry point wiring up the init subcommand
- `src/index.ts` - Updated to re-export git/repo module
- `tests/git/repo.test.ts` - 7 unit tests for git operations using real temp directories
- `tests/commands/init.test.ts` - 9 integration tests for full init pipeline with mock ~/.claude

## Decisions Made
- Derived homeDir from claudeDir parent (path.dirname(claudeDir)) instead of hardcoding os.homedir() -- ensures path rewriting works correctly when claudeDir is overridden for testing or custom setups
- Extracted handleInit() as a standalone async function separate from Commander.js action handler -- enables direct testing without CLI argument parsing
- Used named import `{ simpleGit }` from simple-git instead of default import -- required for correct TypeScript compilation under Node16 module resolution

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed simple-git import for Node16 module resolution**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** `import simpleGit from "simple-git"` default import produced TS2349 "not callable" error under Node16 moduleResolution
- **Fix:** Changed to named import `import { simpleGit } from "simple-git"`
- **Files modified:** src/git/repo.ts
- **Verification:** `npm run typecheck` passes with zero errors
- **Committed in:** 59ec7e7 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed path rewriting using hardcoded os.homedir()**
- **Found during:** Task 2 (RED phase -- integration test caught it)
- **Issue:** handleInit used getHomeDir() (os.homedir()) for path rewriting, but when claudeDir is a custom path (e.g., test temp dir), the home dir is wrong and {{HOME}} tokens are never inserted
- **Fix:** Derived homeDir as path.dirname(claudeDir) so it correctly matches the parent of the .claude directory
- **Files modified:** src/cli/commands/init.ts
- **Verification:** Integration test "rewrites absolute paths in settings.json" passes
- **Committed in:** 9cd50df (Task 2 fix commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 1 Foundation is now complete -- all core modules and the init command are working
- Ready for Phase 2: Sync Operations (push, pull, status commands)
- The init command provides the sync repo that push/pull/status will operate on
- handleInit pattern (extracted handler) establishes the pattern for future command implementations

## Self-Check: PASSED

- All 7 created/modified files verified present on disk
- All 4 commit hashes verified in git log (1b6b7af, 59ec7e7, de328fc, 9cd50df)
- 44/44 tests passing across 5 test files
- TypeScript compiles with zero errors

---
*Phase: 01-foundation*
*Completed: 2026-03-08*
