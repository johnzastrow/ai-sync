import * as fs from "node:fs/promises";
import * as path from "node:path";
import { normalizePath } from "../platform/paths.js";
import { isPathAllowed } from "./manifest.js";

/**
 * Scans a source directory and returns all files that match the allowlist.
 *
 * Follows symlinks to both files and directories so that e.g.
 * `commands/gw -> /external/path` is included. Tracks visited real
 * paths to prevent infinite cycles from circular symlinks.
 *
 * @param sourceDir - Absolute path to the directory to scan
 * @param allowlistFn - Optional custom allowlist function. Defaults to isPathAllowed().
 * @returns Sorted array of relative paths (relative to sourceDir) for allowed files
 * @throws Error if sourceDir does not exist
 */
export async function scanDirectory(
	sourceDir: string,
	allowlistFn?: (relativePath: string) => boolean,
): Promise<string[]> {
	const checkAllowed = allowlistFn ?? isPathAllowed;

	// Verify source directory exists
	try {
		await fs.access(sourceDir);
	} catch {
		throw new Error(`Source directory does not exist: ${sourceDir}`);
	}

	const allowedFiles: string[] = [];
	// Track visited real paths to prevent symlink cycles
	const visitedDirs = new Set<string>();
	visitedDirs.add(await fs.realpath(sourceDir));

	await scanDir(sourceDir, "", checkAllowed, allowedFiles, visitedDirs);

	return allowedFiles.sort();
}

/**
 * Recursively scans a directory, following symlinks while tracking
 * visited real paths to prevent cycles.
 */
async function scanDir(
	baseDir: string,
	prefix: string,
	checkAllowed: (relativePath: string) => boolean,
	results: string[],
	visitedDirs: Set<string>,
): Promise<void> {
	const dirPath = prefix ? path.join(baseDir, prefix) : baseDir;
	let entries: import("node:fs").Dirent[];
	try {
		entries = await fs.readdir(dirPath, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		const relativePath = normalizePath(prefix ? `${prefix}/${entry.name}` : entry.name);

		// Skip .git directories
		if (
			relativePath.includes(".git/") ||
			relativePath.startsWith(".git") ||
			entry.name === ".git"
		) {
			continue;
		}

		if (entry.isFile()) {
			if (checkAllowed(relativePath)) {
				results.push(relativePath);
			}
		} else if (entry.isDirectory()) {
			await scanDir(baseDir, relativePath, checkAllowed, results, visitedDirs);
		} else if (entry.isSymbolicLink()) {
			// Resolve the symlink target
			const fullPath = path.join(dirPath, entry.name);
			let stat: import("node:fs").Stats;
			try {
				stat = await fs.stat(fullPath);
			} catch {
				// Broken symlink, skip
				continue;
			}

			if (stat.isFile()) {
				if (checkAllowed(relativePath)) {
					results.push(relativePath);
				}
			} else if (stat.isDirectory()) {
				// Prevent cycles: check if we've already visited this real path
				const realPath = await fs.realpath(fullPath);
				if (visitedDirs.has(realPath)) {
					continue;
				}
				visitedDirs.add(realPath);
				await scanDir(baseDir, relativePath, checkAllowed, results, visitedDirs);
			}
		}
	}
}
