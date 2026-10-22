import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	CLAUDE_PRINT_ARGS,
	createClaudeAdapter,
	type ExecFn,
} from "../../../src/core/merge/adapters/claude-cli.js";
import { ResolverError } from "../../../src/core/merge/resolver.js";

let tmpRoot: string;

beforeEach(async () => {
	tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-sync-merge-test-"));
});

afterEach(async () => {
	await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("createClaudeAdapter", () => {
	describe("available()", () => {
		it("returns true when claude --version succeeds", async () => {
			const execFn: ExecFn = async (cmd, args) => {
				expect(cmd).toBe("claude");
				expect(args).toEqual(["--version"]);
				return { stdout: "claude 1.0.0\n", stderr: "" };
			};
			const adapter = createClaudeAdapter(execFn);
			expect(await adapter.available()).toBe(true);
		});

		it("returns false when claude --version throws", async () => {
			const execFn: ExecFn = async () => {
				throw new Error("ENOENT");
			};
			const adapter = createClaudeAdapter(execFn);
			expect(await adapter.available()).toBe(false);
		});
	});

	describe("resolve()", () => {
		it("returns stdout as mergedContent on success, prompt piped on stdin", async () => {
			const execFn: ExecFn = async (cmd, args, opts) => {
				expect(cmd).toBe("claude");
				expect(args).toEqual([...CLAUDE_PRINT_ARGS]);
				const promptContent = opts?.input ?? "";
				expect(promptContent).toContain("CLAUDE.md");
				expect(promptContent).toContain("local body");
				expect(promptContent).toContain("remote body");
				return { stdout: "merged body", stderr: "" };
			};
			const adapter = createClaudeAdapter(execFn, { tmpdirRoot: tmpRoot });
			const out = await adapter.resolve({
				relativePath: "CLAUDE.md",
				envName: "claude",
				base: "base body",
				local: "local body",
				remote: "remote body",
				fileType: { kind: "markdown" },
			});
			expect(out.mergedContent).toBe("merged body");
		});

		it("supports null base (new file on both sides)", async () => {
			const execFn: ExecFn = async (_cmd, _args, opts) => {
				expect(opts?.input).toContain("no common ancestor");
				return { stdout: "merged", stderr: "" };
			};
			const adapter = createClaudeAdapter(execFn, { tmpdirRoot: tmpRoot });
			const out = await adapter.resolve({
				relativePath: "new.md",
				envName: "claude",
				base: null,
				local: "L",
				remote: "R",
				fileType: { kind: "markdown" },
			});
			expect(out.mergedContent).toBe("merged");
		});

		it("throws ResolverError with reason non-zero-exit on subprocess failure", async () => {
			const execFn: ExecFn = async () => {
				const err = new Error("exited with code 1") as NodeJS.ErrnoException;
				err.code = "1";
				throw err;
			};
			const adapter = createClaudeAdapter(execFn, { tmpdirRoot: tmpRoot });
			await expect(
				adapter.resolve({
					relativePath: "x.md",
					envName: "claude",
					base: null,
					local: "a",
					remote: "b",
					fileType: { kind: "markdown" },
				}),
			).rejects.toMatchObject({
				name: "ResolverError",
				reason: "non-zero-exit",
			});
		});

		it("throws ResolverError with reason timeout when signal aborts", async () => {
			const execFn: ExecFn = async (_cmd, _args, opts) => {
				return await new Promise((_resolve, reject) => {
					opts?.signal?.addEventListener("abort", () => {
						const err = new Error("aborted") as NodeJS.ErrnoException;
						err.name = "AbortError";
						err.code = "ABORT_ERR";
						reject(err);
					});
				});
			};
			const adapter = createClaudeAdapter(execFn, {
				tmpdirRoot: tmpRoot,
				timeoutMs: 25,
			});
			await expect(
				adapter.resolve({
					relativePath: "x.md",
					envName: "claude",
					base: null,
					local: "a",
					remote: "b",
					fileType: { kind: "markdown" },
				}),
			).rejects.toMatchObject({
				name: "ResolverError",
				reason: "timeout",
			});
		});

		it("throws ResolverError with reason malformed-output on empty stdout", async () => {
			const execFn: ExecFn = async () => ({ stdout: "", stderr: "" });
			const adapter = createClaudeAdapter(execFn, { tmpdirRoot: tmpRoot });
			await expect(
				adapter.resolve({
					relativePath: "x.md",
					envName: "claude",
					base: null,
					local: "a",
					remote: "b",
					fileType: { kind: "markdown" },
				}),
			).rejects.toMatchObject({
				name: "ResolverError",
				reason: "malformed-output",
			});
		});

		it("preserves tempdir on failure with path surfaced via error", async () => {
			const execFn: ExecFn = async () => {
				throw new Error("boom");
			};
			const adapter = createClaudeAdapter(execFn, { tmpdirRoot: tmpRoot });
			try {
				await adapter.resolve({
					relativePath: "x.md",
					envName: "claude",
					base: null,
					local: "a",
					remote: "b",
					fileType: { kind: "markdown" },
				});
				expect.fail("expected throw");
			} catch (err) {
				expect(err).toBeInstanceOf(ResolverError);
				const tempdir = (err as ResolverError).tempdir as string;
				expect(path.dirname(tempdir)).toBe(tmpRoot);
				// tempdir and the prompt should still exist for postmortem
				const prompt = await fs.readFile(path.join(tempdir, "prompt.txt"), "utf-8");
				expect(prompt).toContain("<LOCAL>");
			}
		});

		it("cleans up tempdir on success", async () => {
			const execFn: ExecFn = async () => ({ stdout: "merged", stderr: "" });
			const adapter = createClaudeAdapter(execFn, { tmpdirRoot: tmpRoot });
			await adapter.resolve({
				relativePath: "x.md",
				envName: "claude",
				base: null,
				local: "a",
				remote: "b",
				fileType: { kind: "markdown" },
			});
			expect(await fs.readdir(tmpRoot)).toEqual([]);
		});

		it("never passes the prompt file path as an argument", async () => {
			// Regression: `claude -p <file>` treats the path as the prompt text, so
			// the model saw only a path and replied in prose about not reading it.
			const execFn: ExecFn = async (_cmd, args, opts) => {
				expect(args.some((a) => a.includes("prompt.txt"))).toBe(false);
				expect(args).toContain("--tools");
				expect(args[args.indexOf("--tools") + 1]).toBe("");
				expect(opts?.input).toContain("<REMOTE>");
				return { stdout: "merged", stderr: "" };
			};
			const adapter = createClaudeAdapter(execFn, { tmpdirRoot: tmpRoot });
			await adapter.resolve({
				relativePath: "x.md",
				envName: "claude",
				base: null,
				local: "a",
				remote: "b",
				fileType: { kind: "markdown" },
			});
		});
	});
});
