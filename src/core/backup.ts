import * as fs from "node:fs/promises";
import * as path from "node:path";
import { scanDirectory } from "./scanner.js";

/**
 * Creates a timestamped backup of all allowlisted files in the given directory.
 * Used before pull operations to ensure safety.
 *
 * @param sourceDir - Absolute path to the directory to back up (e.g., ~/.claude)
 * @param backupBaseDir - Absolute path to the base directory for backups
 * @param allowlistFn - Optional custom allowlist function for scanning
 * @returns The absolute path to the created backup directory
 * @throws Error if sourceDir does not exist
 */
export async function createBackup(
	sourceDir: string,
	backupBaseDir: string,
	allowlistFn?: (relativePath: string) => boolean,
): Promise<string> {
	// Generate timestamped directory name
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backupDir = path.join(backupBaseDir, timestamp);

	// Scan for allowlisted files (throws if sourceDir doesn't exist)
	const allowedFiles = await scanDirectory(sourceDir, allowlistFn);

	// Create the backup directory
	await fs.mkdir(backupDir, { recursive: true });

	// Copy each allowlisted file preserving directory structure
	for (const relativePath of allowedFiles) {
		const srcPath = path.join(sourceDir, relativePath);
		const destPath = path.join(backupDir, relativePath);

		// Ensure parent directory exists
		await fs.mkdir(path.dirname(destPath), { recursive: true });

		// Copy the file
		await fs.copyFile(srcPath, destPath);
	}

	return backupDir;
}
