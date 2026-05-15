import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Normalizes a relative path by converting all backslashes to forward slashes.
 * Ensures consistent POSIX-style paths regardless of the source platform.
 *
 * @param relativePath - The path to normalize
 * @returns Path with all backslashes replaced by forward slashes
 */
export function normalizePath(relativePath: string): string {
	return relativePath.replaceAll("\\", "/");
}

const WINDOWS_RESERVED_BASENAMES: ReadonlySet<string> = new Set([
	"CON",
	"PRN",
	"AUX",
	"NUL",
	"COM1",
	"COM2",
	"COM3",
	"COM4",
	"COM5",
	"COM6",
	"COM7",
	"COM8",
	"COM9",
	"LPT1",
	"LPT2",
	"LPT3",
	"LPT4",
	"LPT5",
	"LPT6",
	"LPT7",
	"LPT8",
	"LPT9",
]);

/**
 * Returns true iff `name` is a single path segment that is safe to materialise
 * on disk across POSIX and Windows.
 *
 * Rejects:
 *   - empty / `.` / `..`
 *   - NUL bytes
 *   - colons (NTFS alternate data streams, e.g. `secret.txt:hidden`)
 *   - segments ending in `.` or whitespace (Windows path-rule traps)
 *   - Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9),
 *     case-insensitive, with or without an extension (e.g. `con.md` is still
 *     reserved)
 *
 * Does NOT consider `/` or `\\` — callers should split on the path separator
 * first and validate each segment individually.
 */
export function isSafeFilename(name: string): boolean {
	if (typeof name !== "string" || name === "" || name === "." || name === "..") return false;
	if (name.includes("\0") || name.includes(":")) return false;
	if (name.endsWith(".") || /\s$/.test(name)) return false;
	const base = name.split(".")[0].toUpperCase();
	if (WINDOWS_RESERVED_BASENAMES.has(base)) return false;
	return true;
}

/**
 * Returns true iff every `/`-separated segment of `relativePath` passes
 * {@link isSafeFilename}. The path itself must be relative (no leading `/`),
 * but interior segments are not otherwise constrained — backslashes should be
 * normalised first via {@link normalizePath}.
 */
export function isSafeRelativePath(relativePath: string): boolean {
	if (relativePath === "") return false;
	for (const seg of relativePath.split("/")) {
		if (!isSafeFilename(seg)) return false;
	}
	return true;
}

/**
 * Returns the user's home directory.
 */
export function getHomeDir(): string {
	return os.homedir();
}

/**
 * Returns the path to the ~/.claude directory.
 */
export function getClaudeDir(): string {
	return path.join(getHomeDir(), ".claude");
}

/**
 * Returns the path to the Codex home directory.
 * Respects CODEX_HOME if set.
 */
export function getCodexConfigDir(): string {
	return process.env.CODEX_HOME || path.join(getHomeDir(), ".codex");
}

/**
 * Returns the path to the Antigravity config directory (~/.antigravity).
 */
export function getAntigravityConfigDir(): string {
	return path.join(getHomeDir(), ".antigravity");
}

/**
 * Returns the path to the OpenCode config directory.
 * Respects XDG_CONFIG_HOME if set.
 */
export function getOpenCodeConfigDir(): string {
	const xdgConfig = process.env.XDG_CONFIG_HOME;
	const base = xdgConfig || path.join(getHomeDir(), ".config");
	return path.join(base, "opencode");
}

/**
 * Returns the path to the sync repo directory.
 * Uses a custom path if provided, otherwise defaults to ~/.ai-sync.
 * Falls back to ~/.claude-sync if it exists (migration from claude-sync).
 */
export function getSyncRepoDir(customPath?: string): string {
	if (customPath) return customPath;
	const newPath = path.join(getHomeDir(), ".ai-sync");
	const oldPath = path.join(getHomeDir(), ".claude-sync");
	// Use old path if it exists and new path doesn't
	if (!fs.existsSync(newPath) && fs.existsSync(oldPath)) {
		return oldPath;
	}
	return newPath;
}

/**
 * Resolves the ai-sync install directory by walking up from the
 * currently running script until we find a directory that is both
 * a git repo and contains a package.json with name "ai-sync".
 */
export function getInstallDir(): string {
	// Check environment variables first
	const envDir = process.env.AI_SYNC_INSTALL_DIR ?? process.env.CLAUDE_SYNC_INSTALL_DIR;
	if (envDir) return envDir;

	const thisFile = fileURLToPath(import.meta.url);
	let dir = path.dirname(thisFile);

	for (let i = 0; i < 5; i++) {
		const pkgPath = path.join(dir, "package.json");
		const gitDir = path.join(dir, ".git");
		if (fs.existsSync(pkgPath) && fs.existsSync(gitDir)) {
			try {
				const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
				if (pkg.name === "ai-sync" || pkg.name === "claude-sync") return dir;
			} catch {
				// malformed package.json, keep searching
			}
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}

	throw new Error("Could not find ai-sync install directory");
}
