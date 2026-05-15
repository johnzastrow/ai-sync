import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncPull } from "../../src/core/sync-engine.js";
import { canCreateSymlinks } from "./_can-symlink.js";

/**
 * Integration test for CRIT-2: a malicious sync repo (or a pre-existing
 * symlink on disk) MUST NOT redirect writes during `ai-sync pull` to land
 * outside the configured config dir.
 */
describe.skipIf(!canCreateSymlinks)("sync-engine pull: arbitrary-write defense (CRIT-2)", () => {
	let tmpRoot: string;
	let claudeDir: string;
	let syncRepoDir: string;
	let outsideDir: string;

	beforeEach(async () => {
		tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-sync-pull-"));
		claudeDir = path.join(tmpRoot, ".claude");
		syncRepoDir = path.join(tmpRoot, ".ai-sync");
		outsideDir = path.join(tmpRoot, "outside");
		await fs.mkdir(claudeDir, { recursive: true });
		await fs.mkdir(syncRepoDir, { recursive: true });
		await fs.mkdir(outsideDir, { recursive: true });

		// Initialize the sync repo as a real git repo with a remote so syncPull
		// passes its hasRemote() guard. The remote points at itself; we will
		// pre-populate working-tree files and let syncPull pick them up.
		execSync("git init -q", { cwd: syncRepoDir });
		execSync("git -c user.email=x@y -c user.name=x commit -q --allow-empty -m init", {
			cwd: syncRepoDir,
		});
		execSync(`git remote add origin "${syncRepoDir}"`, { cwd: syncRepoDir });
		execSync("git config receive.denyCurrentBranch ignore", { cwd: syncRepoDir });
	});

	afterEach(async () => {
		await fs.rm(tmpRoot, { recursive: true, force: true });
	});

	it("refuses to write through a pre-existing directory symlink in the destination", async () => {
		// settings.json is on the v1 sync allowlist.
		await fs.writeFile(path.join(syncRepoDir, "settings.json"), '{"k":"v"}');

		// Plant a directory symlink at the destination: ~/.claude/commands -> outsideDir
		await fs.mkdir(path.join(claudeDir, "_keep"));
		await fs.symlink(outsideDir, path.join(claudeDir, "commands"));
		// And a file in the sync repo that would write into ~/.claude/commands/
		await fs.mkdir(path.join(syncRepoDir, "commands"));
		await fs.writeFile(path.join(syncRepoDir, "commands", "evil.md"), "controlled by attacker");

		// Don't let test noise hide assertion failures, but tolerate stderr.
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		await expect(syncPull({ claudeDir, syncRepoDir, homeDir: tmpRoot })).rejects.toThrow(
			/Refusing to write outside/,
		);

		// The file MUST NOT have landed at the symlink target.
		await expect(fs.access(path.join(outsideDir, "evil.md"))).rejects.toThrow();

		warn.mockRestore();
	});

	it("refuses to overwrite a pre-existing file symlink at the destination (writes a new regular file instead)", async () => {
		const sensitive = path.join(outsideDir, "sensitive.txt");
		await fs.writeFile(sensitive, "ORIGINAL");

		// settings.json on disk is a symlink to a sensitive file outside ~/.claude
		await fs.symlink(sensitive, path.join(claudeDir, "settings.json"));

		// Sync repo has a benign settings.json to apply.
		await fs.writeFile(path.join(syncRepoDir, "settings.json"), '{"k":"v"}');

		await syncPull({ claudeDir, syncRepoDir, homeDir: tmpRoot });

		// Sensitive file outside MUST still hold its original content.
		expect(await fs.readFile(sensitive, "utf-8")).toBe("ORIGINAL");

		// The destination is now a regular file, not a symlink.
		const dstStat = await fs.lstat(path.join(claudeDir, "settings.json"));
		expect(dstStat.isSymbolicLink()).toBe(false);
		expect(await fs.readFile(path.join(claudeDir, "settings.json"), "utf-8")).toBe('{"k":"v"}');
	});
});
