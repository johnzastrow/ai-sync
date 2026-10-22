import { describe, expect, it } from "vitest";
import { defaultExecFn } from "../../../../src/core/merge/adapters/claude-cli.js";

describe("defaultExecFn with input", () => {
	// Real child process: echoes stdin back so the pipe is exercised end to end.
	const echo = ["-e", "process.stdin.pipe(process.stdout)"];

	it("writes input to the child's stdin and returns its stdout", async () => {
		const big = "line of prompt text\n".repeat(5000); // ~100 KB, past Windows argv limits
		const out = await defaultExecFn(process.execPath, echo, { input: big });
		expect(out.stdout).toBe(big);
	});

	it("passes an empty-string argument through intact", async () => {
		const out = await defaultExecFn(
			process.execPath,
			["-e", "process.stdout.write(JSON.stringify(process.argv.slice(1)))", "--", "", "x"],
			{ input: "" },
		);
		expect(JSON.parse(out.stdout)).toEqual(["", "x"]);
	});

	it("rejects on non-zero exit", async () => {
		await expect(
			defaultExecFn(process.execPath, ["-e", "process.exit(3)"], { input: "x" }),
		).rejects.toThrow(/exit code 3/);
	});

	it("rejects with an AbortError when the signal fires", async () => {
		const controller = new AbortController();
		const p = defaultExecFn(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], {
			input: "x",
			signal: controller.signal,
		});
		controller.abort();
		await expect(p).rejects.toMatchObject({ name: "AbortError" });
	});
});
