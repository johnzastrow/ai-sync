import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	defaultReportPath,
	formatSyncReport,
	type SyncReportInput,
	writeSyncReport,
} from "../../src/core/report.js";

const BASE: SyncReportInput = {
	command: "pull",
	timestamp: "2026-06-27T12:00:00.000Z",
	syncRepoDir: "/home/u/.ai-sync",
	fileChanges: [
		{ path: "CLAUDE.md", type: "modified" },
		{ path: "commands/new.md", type: "added" },
		{ path: "old.md", type: "deleted" },
	],
};

describe("core/report", () => {
	describe("formatSyncReport", () => {
		it("includes a header, metadata, and a summary total", () => {
			const md = formatSyncReport(BASE);
			expect(md).toContain("# ai-sync Pull report");
			expect(md).toContain("**Time:** 2026-06-27T12:00:00.000Z");
			expect(md).toContain("`/home/u/.ai-sync`");
			// 1 added, 1 modified, 1 deleted, 3 total
			expect(md).toContain("| **All** | 1 | 1 | 1 | 3 |");
		});

		it("lists each change with its type, ordered added/modified/deleted", () => {
			const md = formatSyncReport(BASE);
			const added = md.indexOf("added: `commands/new.md`");
			const modified = md.indexOf("modified: `CLAUDE.md`");
			const deleted = md.indexOf("deleted: `old.md`");
			expect(added).toBeGreaterThan(-1);
			expect(modified).toBeGreaterThan(added);
			expect(deleted).toBeGreaterThan(modified);
		});

		it("marks dry runs and omits the backup line when absent", () => {
			const md = formatSyncReport({ ...BASE, dryRun: true });
			expect(md).toContain("**Mode:** dry run (no changes written)");
			expect(md).not.toContain("Pre-sync snapshot");
		});

		it("references the pre-sync backup as the 'before' snapshot", () => {
			const md = formatSyncReport({ ...BASE, backupDir: "/home/u/.ai-sync-backups/T1" });
			expect(md).toContain("**Pre-sync snapshot (before):** `/home/u/.ai-sync-backups/T1`");
		});

		it("renders a per-environment breakdown when provided", () => {
			const md = formatSyncReport({
				...BASE,
				perEnvironment: {
					claude: { fileChanges: [{ path: "CLAUDE.md", type: "modified" }] },
					opencode: { fileChanges: [{ path: "settings.json", type: "added" }] },
				},
			});
			expect(md).toContain("| claude | 0 | 1 | 0 | 1 |");
			expect(md).toContain("| opencode | 1 | 0 | 0 | 1 |");
			expect(md).toContain("### claude");
			expect(md).toContain("### opencode");
		});

		it("lists conflicts and staged entries when present", () => {
			const md = formatSyncReport({
				...BASE,
				conflicts: [{ path: "kept.md", type: "modified" }],
				staged: [
					{
						envName: "claude",
						relativePath: "CLAUDE.md",
						resolver: "ai-merge",
						timestamp: "2026-06-27T12:00:00.000Z",
					},
				],
			});
			expect(md).toContain("## Conflicts (kept local)");
			expect(md).toContain("`kept.md` (both modified)");
			expect(md).toContain("## Staged for review");
			expect(md).toContain("`claude/CLAUDE.md` (resolver: ai-merge)");
		});

		it("handles an empty sync gracefully", () => {
			const md = formatSyncReport({ ...BASE, fileChanges: [] });
			expect(md).toContain("| **All** | 0 | 0 | 0 | 0 |");
			expect(md).toContain("_No changes._");
		});
	});

	describe("defaultReportPath", () => {
		it("builds a filename with no characters Windows forbids", () => {
			const name = defaultReportPath("push", "2026-06-27T12:00:00.000Z");
			expect(name).toBe("ai-sync-push-report-2026-06-27T12-00-00-000Z.md");
			expect(name).not.toMatch(/[:]/);
		});
	});

	describe("writeSyncReport", () => {
		let tmpDir: string;

		beforeEach(async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-sync-report-"));
		});

		afterEach(async () => {
			await fs.rm(tmpDir, { recursive: true, force: true });
		});

		it("writes the report to disk and returns the resolved path", async () => {
			const target = path.join(tmpDir, "nested", "report.md");
			const written = await writeSyncReport(target, BASE);
			expect(written).toBe(path.resolve(target));
			const content = await fs.readFile(written, "utf-8");
			expect(content).toContain("# ai-sync Pull report");
			expect(content.endsWith("\n")).toBe(true);
		});
	});
});
