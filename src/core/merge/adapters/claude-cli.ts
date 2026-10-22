import * as childProcess from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { buildMergePrompt } from "../prompts.js";
import {
	type MergeInput,
	type MergeOutput,
	type MergeResolver,
	ResolverError,
} from "../resolver.js";

const execFileAsync = promisify(childProcess.execFile);

/**
 * Execution function shape — mirrors src/core/provisioner.ts:9 ExecFn but
 * accepts AbortSignal so the adapter can enforce a hard timeout.
 */
export type ExecFn = (
	cmd: string,
	args: string[],
	options?: { signal?: AbortSignal; input?: string },
) => Promise<{ stdout: string; stderr: string }>;

export function defaultExecFn(
	cmd: string,
	args: string[],
	options?: { signal?: AbortSignal; input?: string },
): Promise<{ stdout: string; stderr: string }> {
	if (options?.input === undefined) {
		return execFileAsync(cmd, args, { signal: options?.signal });
	}
	return spawnWithInput(cmd, args, options.input, options.signal);
}

/**
 * Runs `cmd` with `input` written to its stdin. execFile cannot feed stdin,
 * and the prompt is too large to pass as an argument (Windows caps a command
 * line at ~32K chars), so prompts go through a pipe instead. Rejects with an
 * AbortError on signal abort and with an Error on non-zero exit, matching
 * execFile's failure shapes so callers can treat both paths the same.
 */
function spawnWithInput(
	cmd: string,
	args: string[],
	input: string,
	signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = childProcess.spawn(cmd, args, { signal, stdio: ["pipe", "pipe", "pipe"] });
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.on("error", reject);
		// EPIPE here means the child exited early; the close handler reports it.
		child.stdin.on("error", () => {});
		child.on("close", (code) => {
			const out = Buffer.concat(stdout).toString("utf-8");
			const err = Buffer.concat(stderr).toString("utf-8");
			if (code === 0) {
				resolve({ stdout: out, stderr: err });
			} else {
				reject(new Error(`Command failed with exit code ${code}: ${err.trim()}`));
			}
		});
		child.stdin.end(input, "utf-8");
	});
}

/**
 * argv for a tool-less, one-shot `claude` call that reads its prompt from
 * stdin. `-p <file>` does not work: claude treats the argument as the prompt
 * text, so the model only ever sees a file path. With tools disabled the model
 * cannot wander off reading files and can only answer with text.
 */
export const CLAUDE_PRINT_ARGS: readonly string[] = [
	"-p",
	"--tools",
	"",
	"--no-session-persistence",
	"--output-format",
	"text",
];

export interface ClaudeAdapterOptions {
	/** Hard timeout in milliseconds for `resolve()`. Default 60_000. */
	timeoutMs?: number;
	/** Override the claude binary name (default "claude"). */
	binary?: string;
	/** Tempdir factory; defaults to os.tmpdir(). */
	tmpdirRoot?: string;
}

/**
 * Creates a MergeResolver backed by the `claude` CLI.
 *
 * `available()` runs `claude --version` via the injected execFn.
 * `resolve()` writes the prompt to a tempdir (kept for postmortem), pipes it
 * to `claude -p` on stdin with all tools disabled (see CLAUDE_PRINT_ARGS),
 * and returns stdout as the merged content. A hard timeout is enforced via
 * AbortController. On success the tempdir is cleaned up; on failure it is
 * preserved and the path is surfaced via ResolverError.tempdir.
 */
export function createClaudeAdapter(
	execFn: ExecFn = defaultExecFn,
	options: ClaudeAdapterOptions = {},
): MergeResolver {
	const timeoutMs = options.timeoutMs ?? 60_000;
	const binary = options.binary ?? "claude";
	const tmpdirRoot = options.tmpdirRoot ?? os.tmpdir();

	return {
		name: "claude",
		async available(): Promise<boolean> {
			try {
				await execFn(binary, ["--version"]);
				return true;
			} catch {
				return false;
			}
		},
		async resolve(input: MergeInput): Promise<MergeOutput> {
			const id = crypto.randomBytes(6).toString("hex");
			const tempdir = path.join(tmpdirRoot, `ai-sync-merge-${process.pid}-${id}`);
			await fs.mkdir(tempdir, { recursive: true });

			const promptFile = path.join(tempdir, "prompt.txt");
			const prompt = buildMergePrompt(
				input.relativePath,
				input.base,
				input.local,
				input.remote,
				input.fileType,
			);
			try {
				await fs.writeFile(promptFile, prompt, "utf-8");
				// Preserve base/local/remote for postmortem
				if (input.base !== null) {
					await fs.writeFile(path.join(tempdir, "base.txt"), input.base, "utf-8");
				}
				await fs.writeFile(path.join(tempdir, "local.txt"), input.local, "utf-8");
				await fs.writeFile(path.join(tempdir, "remote.txt"), input.remote, "utf-8");
			} catch (err) {
				throw new ResolverError(
					"io-error",
					`Failed to prepare tempdir ${tempdir}: ${(err as Error).message}`,
					{ tempdir, cause: err },
				);
			}

			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeoutMs);
			let result: { stdout: string; stderr: string };
			try {
				result = await execFn(binary, [...CLAUDE_PRINT_ARGS], {
					signal: controller.signal,
					input: prompt,
				});
			} catch (err) {
				const e = err as NodeJS.ErrnoException & { code?: string; killed?: boolean };
				if (controller.signal.aborted || e.code === "ABORT_ERR" || e.name === "AbortError") {
					throw new ResolverError(
						"timeout",
						`claude exceeded timeout of ${timeoutMs}ms (tempdir: ${tempdir})`,
						{ tempdir, cause: err },
					);
				}
				throw new ResolverError(
					"non-zero-exit",
					`claude exited non-zero: ${(err as Error).message} (tempdir: ${tempdir})`,
					{ tempdir, cause: err },
				);
			} finally {
				clearTimeout(timer);
			}

			const merged = result.stdout;
			if (typeof merged !== "string" || merged.length === 0) {
				throw new ResolverError(
					"malformed-output",
					`claude returned empty stdout (tempdir: ${tempdir})`,
					{ tempdir },
				);
			}

			// Success: cleanup tempdir.
			try {
				await fs.rm(tempdir, { recursive: true, force: true });
			} catch {
				// Best-effort cleanup; ignore failures.
			}

			return { mergedContent: merged };
		},
	};
}
