import type { Command } from "commander";
import pc from "picocolors";
import {
	getEnabledEnvironments,
	isAutoDetecting,
	resetEnvironmentConfig,
	setEnabledEnvironments,
} from "../../core/env-config.js";
import { ALL_ENVIRONMENTS, getEnvironmentById } from "../../core/environment.js";

/**
 * Registers the "env" subcommand group on the CLI program.
 */
export function registerEnvCommand(program: Command): void {
	const envCmd = program.command("env").description("Manage which tool environments are synced");

	envCmd
		.command("list")
		.description("Show all environments and their enabled status")
		.action(() => {
			const auto = isAutoDetecting();
			if (auto) {
				console.log(pc.dim("  Mode: auto-detect (syncing every installed tool)"));
			} else {
				console.log(pc.dim("  Mode: manual (run 'ai-sync env reset' to re-enable auto-detect)"));
			}
			console.log();
			const enabled = new Set(getEnabledEnvironments());
			for (const env of ALL_ENVIRONMENTS) {
				const status = enabled.has(env.id) ? pc.green("enabled") : pc.dim("disabled");
				console.log(`  ${env.id.padEnd(12)} ${env.displayName.padEnd(16)} ${status}`);
				console.log(pc.dim(`${"".padEnd(14)}Config: ${env.getConfigDir()}`));
			}
		});

	envCmd
		.command("enable <id>")
		.description("Enable an environment for syncing")
		.action((id: string) => {
			const env = getEnvironmentById(id);
			if (!env) {
				const known = ALL_ENVIRONMENTS.map((e) => e.id).join(", ");
				console.error(pc.red(`Unknown environment: "${id}". Known: ${known}`));
				process.exitCode = 1;
				return;
			}
			const current = getEnabledEnvironments();
			if (current.includes(id)) {
				console.log(pc.yellow(`${env.displayName} is already enabled`));
				return;
			}
			setEnabledEnvironments([...current, id]);
			console.log(pc.green(`Enabled ${env.displayName}`));
			console.log(pc.dim(`Run 'ai-sync push' to sync ${env.displayName} config to the repo`));
		});

	envCmd
		.command("disable <id>")
		.description("Disable an environment from syncing")
		.action((id: string) => {
			const env = getEnvironmentById(id);
			if (!env) {
				const known = ALL_ENVIRONMENTS.map((e) => e.id).join(", ");
				console.error(pc.red(`Unknown environment: "${id}". Known: ${known}`));
				process.exitCode = 1;
				return;
			}
			const current = getEnabledEnvironments();
			if (!current.includes(id)) {
				console.log(pc.yellow(`${env.displayName} is already disabled`));
				return;
			}
			const updated = current.filter((e) => e !== id);
			if (updated.length === 0) {
				console.error(pc.red("Cannot disable all environments — at least one must remain enabled"));
				process.exitCode = 1;
				return;
			}
			setEnabledEnvironments(updated);
			console.log(pc.green(`Disabled ${env.displayName}`));
		});

	envCmd
		.command("reset")
		.description("Switch back to auto-detection (sync every installed tool)")
		.action(() => {
			resetEnvironmentConfig();
			const detected = getEnabledEnvironments();
			console.log(pc.green("Switched to auto-detect mode"));
			console.log(pc.dim(`  Detected environments: ${detected.join(", ")}`));
		});
}
