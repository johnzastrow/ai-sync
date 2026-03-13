import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Environment } from "./environment.js";
import { getClaudeDir } from "../platform/paths.js";

/**
 * Finds the skills source directory by walking up from the running module.
 */
async function findSkillsDir(): Promise<string> {
	const thisFile = fileURLToPath(import.meta.url);
	let dir = path.dirname(thisFile);

	for (let i = 0; i < 5; i++) {
		const candidate = path.join(dir, "skills");
		try {
			const stat = await fs.stat(candidate);
			if (stat.isDirectory()) return candidate;
		} catch {
			// not here, keep going up
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}

	throw new Error("Could not find skills/ directory in ai-sync installation");
}

export interface InstallSkillsResult {
	installed: string[];
	skipped: string[];
	perEnvironment?: Record<string, { installed: string[]; skipped: string[] }>;
}

/**
 * Installs ai-sync skill files into slash-command directories.
 *
 * When called with environments, installs into each environment's skills subdirectory.
 * Falls back to ~/.claude/commands/ for backward compatibility.
 */
export async function installSkills(
	claudeDir?: string,
	environments?: Environment[],
): Promise<InstallSkillsResult> {
	const skillsDir = await findSkillsDir();
	const entries = await fs.readdir(skillsDir);
	const mdFiles = entries.filter((f) => f.endsWith(".md"));

	const allInstalled: string[] = [];
	const allSkipped: string[] = [];
	const perEnvironment: Record<string, { installed: string[]; skipped: string[] }> = {};

	if (environments && environments.length > 0) {
		for (const env of environments) {
			const subdir = env.getSkillsSubdir();
			if (!subdir) continue;

			const targetBase = path.join(env.getConfigDir(), subdir);
			await fs.mkdir(targetBase, { recursive: true });

			const envInstalled: string[] = [];
			const envSkipped: string[] = [];

			for (const file of mdFiles) {
				const src = path.join(skillsDir, file);
				const dest = path.join(targetBase, file);
				const srcContent = await fs.readFile(src, "utf-8");

				try {
					const destContent = await fs.readFile(dest, "utf-8");
					if (destContent === srcContent) {
						envSkipped.push(file);
						continue;
					}
				} catch {
					// file doesn't exist yet
				}

				await fs.writeFile(dest, srcContent);
				envInstalled.push(file);
			}

			perEnvironment[env.id] = { installed: envInstalled, skipped: envSkipped };
			allInstalled.push(...envInstalled.filter((f) => !allInstalled.includes(f)));
			allSkipped.push(...envSkipped.filter((f) => !allSkipped.includes(f) && !allInstalled.includes(f)));
		}
	} else {
		// Legacy single-directory mode
		const targetBase = path.join(claudeDir ?? getClaudeDir(), "commands");
		await fs.mkdir(targetBase, { recursive: true });

		for (const file of mdFiles) {
			const src = path.join(skillsDir, file);
			const dest = path.join(targetBase, file);
			const srcContent = await fs.readFile(src, "utf-8");

			try {
				const destContent = await fs.readFile(dest, "utf-8");
				if (destContent === srcContent) {
					allSkipped.push(file);
					continue;
				}
			} catch {
				// file doesn't exist yet
			}

			await fs.writeFile(dest, srcContent);
			allInstalled.push(file);
		}
	}

	return {
		installed: allInstalled,
		skipped: allSkipped,
		perEnvironment: Object.keys(perEnvironment).length > 0 ? perEnvironment : undefined,
	};
}
