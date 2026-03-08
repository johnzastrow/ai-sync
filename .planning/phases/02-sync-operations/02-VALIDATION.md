---
phase: 2
slug: sync-operations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `vitest.config.ts` (exists from Phase 1) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | SYNC-03 | integration | `npx vitest run tests/commands/push.test.ts --reporter=verbose` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | SYNC-04, SAFE-01 | integration | `npx vitest run tests/commands/pull.test.ts --reporter=verbose` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 1 | SYNC-05 | integration | `npx vitest run tests/commands/status.test.ts --reporter=verbose` | ❌ W0 | ⬜ pending |
| 2-01-04 | 01 | 1 | SAFE-03 | unit | `npx vitest run tests/core/sync-engine.test.ts --reporter=verbose` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/core/sync-engine.test.ts` — stubs for sync engine logic (push/pull directions, error handling)
- [ ] `tests/core/backup.test.ts` — stubs for backup creation and content verification
- [ ] `tests/commands/push.test.ts` — stubs for push command integration
- [ ] `tests/commands/pull.test.ts` — stubs for pull command integration
- [ ] `tests/commands/status.test.ts` — stubs for status command integration

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Push to real GitHub remote | SYNC-03 | Requires network + auth | Run `claude-sync push` with a configured remote, verify commit appears |
| Pull from real remote with changes | SYNC-04 | Requires two-machine setup | Push from machine A, pull on machine B, verify files match |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 8s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
