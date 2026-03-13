import * as fs from "node:fs";
import * as path from "node:path";
import { getInstallDir } from "../platform/paths.js";
import { ALL_ENVIRONMENTS, type Environment, getEnvironmentById } from "./environment.js";

const ENV_CONFIG_FILE = ".environments.json";

function getConfigPath(): string {
	return path.join(getInstallDir(), ENV_CONFIG_FILE);
}

/**
 * Returns the list of enabled environment IDs.
 * Defaults to ["claude"] if no config file exists.
 */
export function getEnabledEnvironments(): string[] {
	try {
		const content = fs.readFileSync(getConfigPath(), "utf-8");
		const parsed = JSON.parse(content);
		if (Array.isArray(parsed) && parsed.every((e) => typeof e === "string")) {
			return parsed;
		}
	} catch {
		// No file or parse error — default to claude only
	}
	return ["claude"];
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
