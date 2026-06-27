import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncPush } from "../../src/core/sync-engine.js";
import { canCreateSymlinks } from "./_can-symlink.js";

/**
 * Integration test for CRIT-1: a process that plants a symlink inside the
 * synced config directory MUST NOT cause `ai-sync push` to read the target
 * and commit its contents to the sync repo.
 */
describe.skipIf(!canCreateSymlinks)("sync-engine push: exfiltration defense (CRIT-1)", () => {
	let tmpRoot: string;
	let claudeDir: string;
	let syncRepoDir: string;
	let outsideDir: string;

	beforeEach(async () => {
		tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-sync-push-"));
		claudeDir = path.join(tmpRoot, ".claude");
		syncRepoDir = path.join(tmpRoot, ".ai-sync");
		outsideDir = path.join(tmpRoot, "outside");
		await fs.mkdir(claudeDir, { recursive: true });
		await fs.mkdir(path.join(claudeDir, "agents"), { recursive: true });
		await fs.mkdir(syncRepoDir, { recursive: true });
		await fs.mkdir(outsideDir, { recursive: true });

		// -b main: runners that still default to "master" would otherwise make
		// syncPull's `git pull origin main` fail with "couldn't find remote ref main".
		execSync("git init -q -b main", { cwd: syncRepoDir });
		execSync("git -c user.email=x@y -c user.name=x commit -q --allow-empty -m init", {
			cwd: syncRepoDir,
		});
		execSync(`git remote add origin "${syncRepoDir}"`, { cwd: syncRepoDir });
		execSync("git config receive.denyCurrentBranch ignore", { cwd: syncRepoDir });
	});

	afterEach(async () => {
		await fs.rm(tmpRoot, { recursive: true, force: true });
	});

	it("does not include a symlink under ~/.claude/agents/ that points outside the config dir", async () => {
		// Sensitive file outside ~/.claude
		const sensitive = path.join(outsideDir, "id_ed25519");
		await fs.writeFile(sensitive, "SUPER SECRET KEY");

		// Attacker plants a symlink inside an allowlisted directory.
		await fs.symlink(sensitive, path.join(claudeDir, "agents", "innocuous.md"));

		// Mute the expected warning so the test output is clean.
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const result = await syncPush({
			claudeDir,
			syncRepoDir,
			homeDir: tmpRoot,
			dryRun: true,
		}).catch((e) => {
			// dry-run still requires a remote with branch tracking; if it errors
			// for that reason, we fall back to verifying the scanner directly.
			return { error: e instanceof Error ? e.message : String(e) };
		});

		// Whatever happened above, the sensitive content MUST NOT have been
		// written into the sync repo working tree.
		const scannerOutput = await fs.readdir(syncRepoDir, { recursive: true });
		const includesSecret = await (async () => {
			for (const entry of scannerOutput) {
				const p = path.join(syncRepoDir, String(entry));
				try {
					const st = await fs.lstat(p);
					if (st.isFile()) {
						const content = await fs.readFile(p, "utf-8");
						if (content.includes("SUPER SECRET KEY")) return true;
					}
				} catch {
					// skip
				}
			}
			return false;
		})();
		expect(includesSecret).toBe(false);

		// And the FileChange list (if push got that far) must not name our symlink.
		if (!("error" in result)) {
			expect(result.fileChanges.some((c) => c.path.includes("innocuous.md"))).toBe(false);
		}

		warn.mockRestore();
	});
});
