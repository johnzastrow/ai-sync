import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isInside, safeWriteInside } from "../../src/core/safe-fs.js";
import { canCreateSymlinks } from "./_can-symlink.js";

describe("safe-fs containment (CRIT-2 helper)", () => {
	describe("isInside", () => {
		it("treats identical paths as contained", () => {
			expect(isInside("/a/b", "/a/b")).toBe(true);
		});

		it("treats direct children as contained", () => {
			expect(isInside("/a/b", "/a/b/c")).toBe(true);
			expect(isInside("/a/b", "/a/b/c/d")).toBe(true);
		});

		it("rejects siblings", () => {
			expect(isInside("/a/b", "/a/c")).toBe(false);
		});

		it("rejects parents", () => {
			expect(isInside("/a/b", "/a")).toBe(false);
		});

		it("rejects lookalike prefixes (b vs b-evil)", () => {
			expect(isInside("/a/b", "/a/b-evil")).toBe(false);
			expect(isInside("/a/b", "/a/bb")).toBe(false);
		});
	});

	describe("safeWriteInside", () => {
		let rootDir: string;
		let outsideDir: string;

		beforeEach(async () => {
			rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-sync-root-"));
			outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-sync-out-"));
		});

		afterEach(async () => {
			await fs.rm(rootDir, { recursive: true, force: true });
			await fs.rm(outsideDir, { recursive: true, force: true });
		});

		it("writes a file inside the root", async () => {
			const rootReal = await fs.realpath(rootDir);
			await safeWriteInside(rootReal, "commands/x.md", "hello");
			const written = await fs.readFile(path.join(rootReal, "commands/x.md"), "utf-8");
			expect(written).toBe("hello");
		});

		it.skipIf(!canCreateSymlinks)(
			"refuses to write when an intermediate directory is a symlink to outside the root",
			async () => {
			const rootReal = await fs.realpath(rootDir);
			// Pre-existing directory symlink redirecting commands/ -> outsideDir
			await fs.symlink(outsideDir, path.join(rootReal, "commands"));

			await expect(safeWriteInside(rootReal, "commands/x.md", "should not land")).rejects.toThrow(
				/Refusing to write outside/,
			);

			// Confirm the file did NOT appear at the symlink target
			await expect(fs.access(path.join(outsideDir, "x.md"))).rejects.toThrow();
		});

		it.skipIf(!canCreateSymlinks)(
			"unlinks a pre-existing file symlink rather than writing through it",
			async () => {
				const rootReal = await fs.realpath(rootDir);
				const sensitive = path.join(outsideDir, "victim.txt");
				await fs.writeFile(sensitive, "original");

				// Pre-existing symlink at the destination
				await fs.symlink(sensitive, path.join(rootReal, "settings.json"));

				await safeWriteInside(rootReal, "settings.json", "new content");

				// The sensitive file outside MUST be untouched.
				expect(await fs.readFile(sensitive, "utf-8")).toBe("original");
				// The destination is now a regular file with the new content.
				const dstStat = await fs.lstat(path.join(rootReal, "settings.json"));
				expect(dstStat.isSymbolicLink()).toBe(false);
				expect(await fs.readFile(path.join(rootReal, "settings.json"), "utf-8")).toBe(
					"new content",
				);
			},
		);

		it("preserves executable bit from src when requested", async () => {
			const rootReal = await fs.realpath(rootDir);
			const src = path.join(outsideDir, "hook.sh");
			await fs.writeFile(src, "#!/bin/sh\necho hi");
			await fs.chmod(src, 0o755);

			await safeWriteInside(rootReal, "hooks/hook.sh", "content", {
				preserveModeFromSrc: src,
			});

			const stat = await fs.stat(path.join(rootReal, "hooks/hook.sh"));
			// On POSIX the exec bits should be present. On Windows chmod is best-effort
			// so we only assert that the owner-read bit survived.
			if (process.platform !== "win32") {
				expect(stat.mode & 0o100).toBe(0o100);
			} else {
				expect(stat.mode & 0o400).toBe(0o400);
			}
		});

		it("strips setuid/setgid/sticky bits when preserving mode", async () => {
			if (process.platform === "win32") return; // POSIX-only semantics

			const rootReal = await fs.realpath(rootDir);
			const src = path.join(outsideDir, "danger.sh");
			await fs.writeFile(src, "x");
			// Attacker sets setuid bit on the source.
			await fs.chmod(src, 0o4755);

			await safeWriteInside(rootReal, "hooks/danger.sh", "x", {
				preserveModeFromSrc: src,
			});

			const stat = await fs.stat(path.join(rootReal, "hooks/danger.sh"));
			expect(stat.mode & 0o4000).toBe(0); // setuid stripped
			expect(stat.mode & 0o2000).toBe(0); // setgid stripped
			expect(stat.mode & 0o1000).toBe(0); // sticky stripped
		});

		describe("unsafe relPath refusal", () => {
			it("refuses relPaths containing '..'", async () => {
				const rootReal = await fs.realpath(rootDir);
				await expect(
					safeWriteInside(rootReal, "agents/../escape.md", "x"),
				).rejects.toThrow(/unsafe relative path/);
				// And confirm nothing was created up at the rootReal parent.
				await expect(
					fs.access(path.join(path.dirname(rootReal), "escape.md")),
				).rejects.toThrow();
			});

			it("refuses absolute relPaths", async () => {
				const rootReal = await fs.realpath(rootDir);
				await expect(
					safeWriteInside(rootReal, "/etc/passwd", "x"),
				).rejects.toThrow(/unsafe relative path/);
			});

			it("refuses Windows reserved-name segments", async () => {
				const rootReal = await fs.realpath(rootDir);
				await expect(
					safeWriteInside(rootReal, "CON", "x"),
				).rejects.toThrow(/unsafe relative path/);
				await expect(
					safeWriteInside(rootReal, "agents/con.md", "x"),
				).rejects.toThrow(/unsafe relative path/);
			});

			it("refuses NTFS alternate-data-stream colons", async () => {
				const rootReal = await fs.realpath(rootDir);
				await expect(
					safeWriteInside(rootReal, "settings.json:hidden", "x"),
				).rejects.toThrow(/unsafe relative path/);
			});

			it("refuses an empty relPath", async () => {
				const rootReal = await fs.realpath(rootDir);
				await expect(safeWriteInside(rootReal, "", "x")).rejects.toThrow(
					/unsafe relative path/,
				);
			});
		});
	});
});
