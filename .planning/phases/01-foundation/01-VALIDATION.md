---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.0.18 |
| **Config file** | `vitest.config.ts` — needs creation in Wave 0 |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --coverage` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | SYNC-01 | integration | `npx vitest run tests/commands/init.test.ts -x` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | SYNC-02 | unit | `npx vitest run tests/core/manifest.test.ts -x` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | SYNC-02 | unit | `npx vitest run tests/core/scanner.test.ts -x` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 1 | SAFE-02 | unit | `npx vitest run tests/core/path-rewriter.test.ts -x` | ❌ W0 | ⬜ pending |
| 1-01-05 | 01 | 1 | CROSS-01 | integration | `npx vitest run tests/git/repo.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — vitest configuration
- [ ] `tests/commands/init.test.ts` — stubs for SYNC-01
- [ ] `tests/core/manifest.test.ts` — stubs for SYNC-02 manifest defaults
- [ ] `tests/core/scanner.test.ts` — stubs for SYNC-02 scanner behavior
- [ ] `tests/core/path-rewriter.test.ts` — stubs for SAFE-02
- [ ] `tests/git/repo.test.ts` — stubs for .gitattributes enforcement

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Init from real ~/.claude directory | SYNC-01 | Requires actual ~/.claude access | Run `claude-sync init` on a machine with existing ~/.claude, verify repo created |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
