import * as os from "node:os";
import * as path from "node:path";

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
 * Returns the path to the sync repo directory.
 * Uses a custom path if provided, otherwise defaults to ~/.claude-sync.
 */
export function getSyncRepoDir(customPath?: string): string {
	return customPath ?? path.join(getHomeDir(), ".claude-sync");
}
