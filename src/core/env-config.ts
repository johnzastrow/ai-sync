import * as fs from "node:fs";
import * as path from "node:path";
import { getInstallDir } from "../platform/paths.js";
import { ALL_ENVIRONMENTS, type Environment, getEnvironmentById } from "./environment.js";

const ENV_CONFIG_FILE = ".environments.json";

function getConfigPath(): string {
	return path.join(getInstallDir(), ENV_CONFIG_FILE);
}

/**
 * Auto-detect which environments are installed by checking whether
 * their config directories exist on disk.  Falls back to ["claude"]
 * if none are found (e.g. fresh machine before any tool has run).
 */
function detectInstalledEnvironments(): string[] {
	const detected: string[] = [];
	for (const env of ALL_ENVIRONMENTS) {
		try {
			fs.accessSync(env.getConfigDir());
			detected.push(env.id);
		} catch {
			// Config dir doesn't exist — tool not installed
		}
	}
	return detected.length > 0 ? detected : ["claude"];
}

/**
 * Returns the list of enabled environment IDs.
 *
 * If the user has explicitly configured environments (via `env enable`
 * or `env disable`), the stored list is used.  Otherwise, environments
 * are auto-detected by checking which tools have config directories on
 * disk.  This means a fresh install automatically syncs every tool
 * that is present — no manual `env enable` required.
 */
export function getEnabledEnvironments(): string[] {
	try {
		const content = fs.readFileSync(getConfigPath(), "utf-8");
		const parsed = JSON.parse(content);
		if (Array.isArray(parsed) && parsed.every((e) => typeof e === "string")) {
			return parsed;
		}
	} catch {
		// No file or parse error — fall through to auto-detection
	}
	return detectInstalledEnvironments();
}

/**
 * Writes the list of enabled environment IDs to the config file.
 */
export function setEnabledEnvironments(ids: string[]): void {
	// Validate all IDs are known
	for (const id of ids) {
		if (!getEnvironmentById(id)) {
			const known = ALL_ENVIRONMENTS.map((e) => e.id).join(", ");
			throw new Error(`Unknown environment: "${id}". Known environments: ${known}`);
		}
	}
	if (ids.length === 0) {
		throw new Error("At least one environment must be enabled");
	}
	const configPath = getConfigPath();
	fs.mkdirSync(path.dirname(configPath), { recursive: true });
	fs.writeFileSync(configPath, JSON.stringify(ids, null, 2) + "\n");
}

/**
 * Returns true when environments are auto-detected (no explicit config file).
 */
export function isAutoDetecting(): boolean {
	try {
		fs.accessSync(getConfigPath());
		return false;
	} catch {
		return true;
	}
}

/**
 * Removes the explicit environment config file so that environments
 * are auto-detected again on the next operation.
 */
export function resetEnvironmentConfig(): void {
	try {
		fs.unlinkSync(getConfigPath());
	} catch {
		// Already absent — nothing to do
	}
}

/**
 * Returns Environment instances for all enabled environments.
 */
export function getEnabledEnvironmentInstances(): Environment[] {
	const ids = getEnabledEnvironments();
	const envs: Environment[] = [];
	for (const id of ids) {
		const env = getEnvironmentById(id);
		if (env) envs.push(env);
	}
	return envs;
}
