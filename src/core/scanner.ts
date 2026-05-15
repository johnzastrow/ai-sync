import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isSafeFilename, normalizePath } from "../platform/paths.js";
import { isPathAllowed } from "./manifest.js";
import { isInside } from "./safe-fs.js";

/**
 * Scans a source directory and returns all files matching the allowlist.
 *
 * Symlink handling:
 *   - `lstat` is used exclusively; nothing is dereferenced silently.
 *   - A symlink whose realpath leaves the source tree is dropped with a
 *     warning (defends against a process planting a symlink that points at
 *     `~/.ssh/id_ed25519` or similar to exfiltrate via push).
 *   - A symlink that points inside the source tree is followed and counted
 *     against `visitedDirs` to prevent cycles.
 *
 * @param sourceDir Absolute path to scan.
 * @param allowlistFn Optional override; defaults to {@link isPathAllowed}.
 * @returns Sorted list of allowed relative paths (forward-slash separators).
 * @throws If `sourceDir` does not exist.
 */
export async function scanDirectory(
	sourceDir: string,
	allowlistFn?: (relativePath: string) => boolean,
): Promise<string[]> {
	const checkAllowed = allowlistFn ?? isPathAllowed;

	try {
		await fs.access(sourceDir);
	} catch {
		throw new Error(`Source directory does not exist: ${sourceDir}`);
	}

	const sourceReal = await fs.realpath(sourceDir);
	const allowedFiles: string[] = [];
	const visitedDirs = new Set<string>([sourceReal]);

	await scanDir(sourceDir, "", checkAllowed, allowedFiles, visitedDirs, sourceReal);

	return allowedFiles.sort();
}

async function scanDir(
	baseDir: string,
	prefix: string,
	checkAllowed: (relativePath: string) => boolean,
	results: string[],
	visitedDirs: Set<string>,
	sourceReal: string,
): Promise<void> {
	const dirPath = prefix ? path.join(baseDir, prefix) : baseDir;
	let entries: import("node:fs").Dirent[];
	try {
		entries = await fs.readdir(dirPath, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		// Refuse pathological filenames per-segment (Windows reserved names,
		// alternate-data-stream colons, trailing dots/spaces, embedded nulls).
		if (!isSafeFilename(entry.name)) {
			console.warn(
				`ai-sync: skipping unsafe filename '${entry.name}' under ${dirPath}`,
			);
			continue;
		}

		const relativePath = normalizePath(prefix ? `${prefix}/${entry.name}` : entry.name);

		if (
			relativePath.includes(".git/") ||
			relativePath.startsWith(".git") ||
			entry.name === ".git"
		) {
			continue;
		}

		const fullPath = path.join(dirPath, entry.name);
		const lst = await fs.lstat(fullPath).catch(() => null);
		if (!lst) continue;

		if (lst.isSymbolicLink()) {
			let real: string;
			try {
				real = await fs.realpath(fullPath);
			} catch {
				continue;
			}
			if (!isInside(sourceReal, real)) {
				console.warn(
					`ai-sync: refusing to follow symlink that leaves ${sourceReal}: ${fullPath} -> ${real}`,
				);
				continue;
			}
			const targetStat = await fs.stat(real).catch(() => null);
			if (!targetStat) continue;
			if (targetStat.isFile()) {
				if (checkAllowed(relativePath)) results.push(relativePath);
			} else if (targetStat.isDirectory()) {
				if (visitedDirs.has(real)) continue;
				visitedDirs.add(real);
				await scanDir(baseDir, relativePath, checkAllowed, results, visitedDirs, sourceReal);
			}
		} else if (lst.isFile()) {
			if (checkAllowed(relativePath)) results.push(relativePath);
		} else if (lst.isDirectory()) {
			await scanDir(baseDir, relativePath, checkAllowed, results, visitedDirs, sourceReal);
		}
	}
}
