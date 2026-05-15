import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scanDirectory } from "../../src/core/scanner.js";

describe("scanner", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-sync-test-"));
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	async function createFile(relativePath: string, content = ""): Promise<void> {
		const fullPath = path.join(tmpDir, relativePath);
		await fs.mkdir(path.dirname(fullPath), { recursive: true });
		await fs.writeFile(fullPath, content);
	}

	it("returns only files matching the allowlist from a directory tree", async () => {
		await createFile("settings.json", "{}");
		await createFile("CLAUDE.md", "# Config");
		await createFile("random-file.txt", "nope");
		await createFile("some-dir/file.ts", "nope");

		const result = await scanDirectory(tmpDir);
		expect(result).toContain("settings.json");
		expect(result).toContain("CLAUDE.md");
		expect(result).not.toContain("random-file.txt");
		expect(result).not.toContain("some-dir/file.ts");
	});

	it("excludes files in ephemeral directories", async () => {
		await createFile("settings.json", "{}");
		await createFile("projects/foo.md", "project");
		await createFile("debug/logs.txt", "debug");
		await createFile("telemetry/data.json", "telemetry");

		const result = await scanDirectory(tmpDir);
		expect(result).toContain("settings.json");
		expect(result).not.toContain("projects/foo.md");
		expect(result).not.toContain("debug/logs.txt");
		expect(result).not.toContain("telemetry/data.json");
	});

	it("returns relative paths", async () => {
		await createFile("settings.json", "{}");
		await createFile("agents/my-skill/SKILL.md", "skill");

		const result = await scanDirectory(tmpDir);
		for (const p of result) {
			expect(path.isAbsolute(p)).toBe(false);
		}
	});

	it("returns empty array for empty source directory", async () => {
		const result = await scanDirectory(tmpDir);
		expect(result).toEqual([]);
	});

	it("throws descriptive error for missing source directory", async () => {
		const missing = path.join(tmpDir, "nonexistent");
		await expect(scanDirectory(missing)).rejects.toThrow(
			`Source directory does not exist: ${missing}`,
		);
	});

	it("includes nested files under allowed directories", async () => {
		await createFile("agents/foo/bar.ts", "code");
		await createFile("agents/baz/deep/nested.md", "content");
		await createFile("hooks/pre-commit.sh", "#!/bin/bash");

		const result = await scanDirectory(tmpDir);
		expect(result).toContain("agents/foo/bar.ts");
		expect(result).toContain("agents/baz/deep/nested.md");
		expect(result).toContain("hooks/pre-commit.sh");
	});

	it("includes files under rules/ directory", async () => {
		await createFile("rules/context7.md", "# Context7 rules");
		await createFile("rules/team/coding-standards.md", "# Team standards");

		const result = await scanDirectory(tmpDir);
		expect(result).toContain("rules/context7.md");
		expect(result).toContain("rules/team/coding-standards.md");
	});

	it("includes keybindings.json when present", async () => {
		await createFile("keybindings.json", '{"bindings": []}');

		const result = await scanDirectory(tmpDir);
		expect(result).toContain("keybindings.json");
	});

	it("follows symlinked files", async () => {
		await createFile("CLAUDE.md", "# Real file");
		// Create a symlink to an allowed file
		await fs.symlink(path.join(tmpDir, "CLAUDE.md"), path.join(tmpDir, "settings.json"));

		const result = await scanDirectory(tmpDir);
		expect(result).toContain("CLAUDE.md");
		// settings.json is a symlink to a file, should be included
		expect(result).toContain("settings.json");
	});

	it("follows symlinked directories", async () => {
		// Create an external directory with files
		const externalDir = path.join(tmpDir, "_external");
		await fs.mkdir(externalDir, { recursive: true });
		await fs.writeFile(path.join(externalDir, "skill.md"), "# Skill");

		// Create commands/gw as a symlink to the external directory
		await fs.mkdir(path.join(tmpDir, "commands"), { recursive: true });
		await fs.symlink(externalDir, path.join(tmpDir, "commands", "gw"));

		const result = await scanDirectory(tmpDir);
		expect(result).toContain("commands/gw/skill.md");
	});

	it("prevents cycles from circular symlinks", async () => {
		// Create a directory with a symlink back to parent
		await createFile("commands/real.md", "# Real");
		await fs.symlink(tmpDir, path.join(tmpDir, "commands", "loop"));

		const result = await scanDirectory(tmpDir);
		expect(result).toContain("commands/real.md");
		// Should not loop infinitely
	});

	it("returns forward-slash relative paths (cross-platform contract)", async () => {
		await createFile("agents/skill/SKILL.md", "skill");
		await createFile("hooks/pre-push.sh", "#!/bin/bash");

		const result = await scanDirectory(tmpDir);
		for (const p of result) {
			expect(p).not.toContain("\\");
			expect(path.isAbsolute(p)).toBe(false);
		}
		expect(result).toContain("agents/skill/SKILL.md");
		expect(result).toContain("hooks/pre-push.sh");
	});

	// POSIX filesystems happily accept filenames like `settings.json:hidden`,
	// `bad.` (trailing dot), or `CON` — names that on Windows would be either
	// rejected by the OS or interpreted as NTFS alternate data streams /
	// reserved devices. If a sync repo cloned on POSIX contains such a name,
	// the scanner must not surface it; otherwise a later sync onto a Windows
	// box would either fail surprisingly or write to the wrong file.
	it.skipIf(process.platform === "win32")(
		"skips entries whose basename would be unsafe on Windows",
		async () => {
			await createFile("agents/normal.md", "ok");
			// Trailing-dot basename — rejected by isSafeFilename.
			await createFile("agents/trailing.", "x");
			// Colon — looks like an NTFS alternate data stream.
			await createFile("agents/secret.md:hidden", "x");
			// Reserved device basename.
			await createFile("agents/CON", "x");

			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			try {
				const result = await scanDirectory(tmpDir);
				expect(result).toContain("agents/normal.md");
				expect(result).not.toContain("agents/trailing.");
				expect(result).not.toContain("agents/secret.md:hidden");
				expect(result).not.toContain("agents/CON");
				// At least one warning was emitted naming the skipped entry.
				const joined = warnSpy.mock.calls.map((c) => c.join(" ")).join("\n");
				expect(joined).toMatch(/unsafe filename/);
			} finally {
				warnSpy.mockRestore();
			}
		},
	);
});
