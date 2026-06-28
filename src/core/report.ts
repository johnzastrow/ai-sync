import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { StagedEntry } from "./merge/staging.js";
import type { FileChange } from "./sync-engine.js";

/**
 * Normalized input for a sync report. Built from a SyncPullResult or
 * SyncPushResult by the CLI layer — the report module performs no sync logic
 * of its own, it only documents what the engine already computed.
 */
export interface SyncReportInput {
	command: "pull" | "push";
	/** ISO timestamp of the sync. */
	timestamp: string;
	/** Absolute path of the sync repo involved. */
	syncRepoDir: string;
	/** True when the sync was a dry run (nothing was actually written). */
	dryRun?: boolean;
	/** Aggregate file changes across all environments (the before -> after delta). */
	fileChanges: FileChange[];
	/** Per-environment breakdown, when the engine reports one. */
	perEnvironment?: Record<string, { fileChanges: FileChange[] }>;
	/** Conflicts where local changes were kept instead of remote (pull only). */
	conflicts?: FileChange[];
	/** Entries staged for manual review (pull only). */
	staged?: StagedEntry[];
	/** Pre-sync backup directory — the snapshot of local state *before* the sync (pull only). */
	backupDir?: string;
}

interface ChangeCounts {
	added: number;
	modified: number;
	deleted: number;
}

function countByType(changes: FileChange[]): ChangeCounts {
	const counts: ChangeCounts = { added: 0, modified: 0, deleted: 0 };
	for (const change of changes) {
		counts[change.type]++;
	}
	return counts;
}

const TYPE_ORDER: Record<FileChange["type"], number> = { added: 0, modified: 1, deleted: 2 };

function renderChangeList(changes: FileChange[]): string {
	if (changes.length === 0) {
		return "_No changes._";
	}
	const sorted = [...changes].sort(
		(a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.path.localeCompare(b.path),
	);
	return sorted.map((c) => `- ${c.type}: \`${c.path}\``).join("\n");
}

/**
 * Renders a markdown report documenting a sync's before -> after delta.
 *
 * Pure function: it takes already-computed engine output and performs no I/O,
 * which keeps it trivially testable. The "before" state is referenced via the
 * pre-sync backup directory; the "after" state is the before state with the
 * listed changes applied.
 */
export function formatSyncReport(input: SyncReportInput): string {
	const verb = input.command === "pull" ? "Pull" : "Push";
	const lines: string[] = [];

	lines.push(`# ai-sync ${verb} report`, "");
	lines.push(`- **Time:** ${input.timestamp}`);
	lines.push(`- **Sync repo:** \`${input.syncRepoDir}\``);
	lines.push(`- **Mode:** ${input.dryRun ? "dry run (no changes written)" : "applied"}`);
	if (input.backupDir) {
		lines.push(`- **Pre-sync snapshot (before):** \`${input.backupDir}\``);
	}
	lines.push("");

	// Summary table — one row per environment plus an "All" total.
	const total = countByType(input.fileChanges);
	lines.push("## Summary", "");
	lines.push("| Scope | Added | Modified | Deleted | Total |");
	lines.push("|---|---:|---:|---:|---:|");
	if (input.perEnvironment) {
		for (const [env, data] of Object.entries(input.perEnvironment)) {
			const c = countByType(data.fileChanges);
			lines.push(
				`| ${env} | ${c.added} | ${c.modified} | ${c.deleted} | ${data.fileChanges.length} |`,
			);
		}
	}
	lines.push(
		`| **All** | ${total.added} | ${total.modified} | ${total.deleted} | ${input.fileChanges.length} |`,
	);
	lines.push("");

	// Detailed change lists, per environment when available.
	lines.push("## Changes", "");
	const envEntries = input.perEnvironment ? Object.entries(input.perEnvironment) : [];
	if (envEntries.length > 0) {
		for (const [env, data] of envEntries) {
			lines.push(`### ${env}`, "", renderChangeList(data.fileChanges), "");
		}
	} else {
		lines.push(renderChangeList(input.fileChanges), "");
	}

	if (input.conflicts && input.conflicts.length > 0) {
		lines.push("## Conflicts (kept local)", "");
		for (const c of input.conflicts) {
			const label = c.type === "deleted" ? "remote deleted" : "both modified";
			lines.push(`- \`${c.path}\` (${label})`);
		}
		lines.push("");
	}

	if (input.staged && input.staged.length > 0) {
		lines.push("## Staged for review", "");
		for (const s of input.staged) {
			lines.push(`- \`${s.envName}/${s.relativePath}\` (resolver: ${s.resolver})`);
		}
		lines.push("");
	}

	return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * Builds a default timestamped report filename for a command, safe for all
 * platforms (no colons, which Windows forbids in filenames).
 */
export function defaultReportPath(command: "pull" | "push", timestamp: string): string {
	const safe = timestamp.replace(/[:.]/g, "-");
	return `ai-sync-${command}-report-${safe}.md`;
}

/**
 * Writes a sync report to disk and returns the resolved absolute path.
 */
export async function writeSyncReport(filePath: string, input: SyncReportInput): Promise<string> {
	const resolved = path.resolve(filePath);
	await fs.mkdir(path.dirname(resolved), { recursive: true });
	await fs.writeFile(resolved, formatSyncReport(input), "utf-8");
	return resolved;
}
