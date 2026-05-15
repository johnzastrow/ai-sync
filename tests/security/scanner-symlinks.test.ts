import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scanDirectory } from "../../src/core/scanner.js";
import { canCreateSymlinks } from "./_can-symlink.js";

describe.skipIf(!canCreateSymlinks)("scanner security: symlink containment (CRIT-1)", () => {
	let tmpDir: string;
	let outsideDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-sync-sec-"));
		outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-sync-outside-"));
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
		await fs.rm(outsideDir, { recursive: true, force: true });
	});

	it("refuses to follow a file symlink that points outside the source tree", async () => {
		const sensitive = path.join(outsideDir, "id_ed25519");
		await fs.writeFile(sensitive, "PRIVATE KEY");

		await fs.mkdir(path.join(tmpDir, "agents"));
		// Attacker plants this symlink under an allowlisted directory.
		await fs.symlink(sensitive, path.join(tmpDir, "agents", "exfil.md"));

		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const result = await scanDirectory(tmpDir);

		expect(result).not.toContain("agents/exfil.md");
		expect(warn).toHaveBeenCalledWith(expect.stringMatching(/refusing to follow symlink/));
		warn.mockRestore();
	});

	it("refuses to follow a directory symlink that points outside the source tree", async () => {
		await fs.mkdir(path.join(outsideDir, "secrets"), { recursive: true });
		await fs.writeFile(path.join(outsideDir, "secrets", "key.md"), "secret");

		await fs.mkdir(path.join(tmpDir, "agents"));
		await fs.symlink(path.join(outsideDir, "secrets"), path.join(tmpDir, "agents", "linked"));

		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const result = await scanDirectory(tmpDir);

		expect(result.some((p) => p.startsWith("agents/linked"))).toBe(false);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("still follows symlinks whose target stays inside the source tree", async () => {
		// Legitimate use case: commands/gw -> ../external-inside-tmp/skill.md
		const insideExternal = path.join(tmpDir, "_internal");
		await fs.mkdir(insideExternal);
		await fs.writeFile(path.join(insideExternal, "skill.md"), "# Skill");

		await fs.mkdir(path.join(tmpDir, "commands"));
		await fs.symlink(insideExternal, path.join(tmpDir, "commands", "gw"));

		const result = await scanDirectory(tmpDir);
		expect(result).toContain("commands/gw/skill.md");
	});

	it("ignores a broken symlink without throwing", async () => {
		await fs.mkdir(path.join(tmpDir, "agents"));
		await fs.symlink(
			path.join(outsideDir, "does-not-exist"),
			path.join(tmpDir, "agents", "broken.md"),
		);

		const result = await scanDirectory(tmpDir);
		expect(result).not.toContain("agents/broken.md");
	});
});
