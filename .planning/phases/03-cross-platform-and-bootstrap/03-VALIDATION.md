---
phase: 3
slug: cross-platform-and-bootstrap
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `vitest.config.ts` (exists from Phase 1) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | SETUP-02 | unit | `npx vitest run tests/platform/paths.test.ts --reporter=verbose` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | SETUP-01 | integration | `npx vitest run tests/commands/bootstrap.test.ts --reporter=verbose` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/platform/paths.test.ts` — stubs for normalizePath and cross-platform path resolution
- [ ] `tests/commands/bootstrap.test.ts` — stubs for bootstrap command integration
- [ ] Additional cases in `tests/core/scanner.test.ts` for cross-platform paths
- [ ] Additional cases in `tests/core/path-rewriter.test.ts` for Windows separators

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bootstrap on real Linux machine | SETUP-01 | Requires actual Linux environment | Run `claude-sync bootstrap <url>` on Linux, verify ~/.claude populated |
| Bootstrap on WSL | SETUP-01, SETUP-02 | Requires WSL environment | Run same command in WSL, verify paths resolve correctly |
| Hook scripts execute cross-platform | SETUP-02 | Requires actual hook execution | Sync hooks from macOS to Linux, run Claude Code, verify hooks fire |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
