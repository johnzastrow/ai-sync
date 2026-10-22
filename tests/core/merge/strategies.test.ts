import { describe, expect, it, vi } from "vitest";
import { defaultMergeConfig } from "../../../src/core/merge/config.js";
import type { MergeInput, MergeResolver } from "../../../src/core/merge/resolver.js";
import { classify, looksLikeMerge, mergeWithStrategy } from "../../../src/core/merge/strategies.js";

function fakeResolver(merged: string): MergeResolver & { calls: number } {
	const out = {
		name: "fake",
		calls: 0,
		async available() {
			return true;
		},
		async resolve() {
			out.calls++;
			return { mergedContent: merged };
		},
	};
	return out;
}

const baseInput = (relativePath: string): Omit<MergeInput, "fileType"> => ({
	relativePath,
	envName: "claude",
	base: "B",
	local: "L",
	remote: "R",
});

describe("classify()", () => {
	it("matches the orchestrator's classifyFile()", () => {
		expect(classify("a.md").kind).toBe("markdown");
		expect(classify("a.json").kind).toBe("json");
		expect(classify("a.yaml").kind).toBe("yaml");
		expect(classify("Makefile").kind).toBe("unknown");
	});
});

describe("mergeWithStrategy()", () => {
	const cfg = defaultMergeConfig();

	it("markdown passes resolver output through verbatim", async () => {
		const r = fakeResolver("# merged content\n");
		const result = await mergeWithStrategy(baseInput("CLAUDE.md"), r, cfg);
		expect(r.calls).toBe(1);
		expect(result.ok).toBe(true);
		expect(result.ok && result.mergedContent).toBe("# merged content\n");
		expect(result.fileType.kind).toBe("markdown");
	});

	it("valid JSON passes parse-validation", async () => {
		const r = fakeResolver('{"a": 1, "b": [2, 3]}');
		const result = await mergeWithStrategy(baseInput("settings.json"), r, cfg);
		expect(result.ok).toBe(true);
		expect(result.ok && result.mergedContent).toBe('{"a": 1, "b": [2, 3]}');
	});

	it("invalid JSON returns ok=false reason=json-parse", async () => {
		const r = fakeResolver('{"a": 1,'); // truncated
		const result = await mergeWithStrategy(baseInput("settings.json"), r, cfg);
		expect(result.ok).toBe(false);
		expect(!result.ok && result.reason).toBe("json-parse");
	});

	it("valid YAML passes parse-validation", async () => {
		const r = fakeResolver("a: 1\nb:\n  - 2\n  - 3\n");
		const result = await mergeWithStrategy(baseInput("config.yaml"), r, cfg);
		expect(result.ok).toBe(true);
		expect(result.fileType.kind).toBe("yaml");
	});

	it("invalid YAML returns ok=false reason=yaml-parse", async () => {
		const r = fakeResolver("a: 1\n  b: : :\n\t- bad indent"); // tab+invalid
		const result = await mergeWithStrategy(baseInput("config.yaml"), r, cfg);
		expect(result.ok).toBe(false);
		expect(!result.ok && result.reason).toBe("yaml-parse");
	});

	it("unknown extension returns ok=false reason=unsupported-type", async () => {
		const r = fakeResolver("anything");
		const result = await mergeWithStrategy(baseInput("Makefile"), r, cfg);
		expect(r.calls).toBe(0);
		expect(result.ok).toBe(false);
		expect(!result.ok && result.reason).toBe("unsupported-type");
	});

	it("perType override forces keep-local on *.lock without calling resolver", async () => {
		const r = fakeResolver("would have merged");
		const result = await mergeWithStrategy(baseInput("package-lock.json"), r, {
			perType: { "*.json": "keep-local" },
		});
		expect(r.calls).toBe(0);
		expect(result.ok).toBe(false);
		expect(!result.ok && result.reason).toBe("keep-local-override");
	});

	it("perType override: *.md → ai-validated treats markdown as JSON-shaped", async () => {
		const r = fakeResolver("not json");
		const result = await mergeWithStrategy(baseInput("note.md"), r, {
			perType: { "*.md": "ai-validated" },
		});
		expect(r.calls).toBe(1);
		expect(result.ok).toBe(false);
		expect(!result.ok && result.reason).toBe("json-parse");
	});

	it("perType override: *.md → ai-validated with valid JSON content passes", async () => {
		const r = fakeResolver('{"ok":true}');
		const result = await mergeWithStrategy(baseInput("note.md"), r, {
			perType: { "*.md": "ai-validated" },
		});
		expect(result.ok).toBe(true);
	});

	it("perType *.lock → keep-local short-circuits", async () => {
		const r = fakeResolver("x");
		const result = await mergeWithStrategy(baseInput("yarn.lock"), r, {
			perType: { "*.lock": "keep-local", "*": "ai-freeform" },
		});
		expect(r.calls).toBe(0);
		expect(result.ok).toBe(false);
	});

	it("does not propagate resolver exceptions — caller handles them", async () => {
		const resolver: MergeResolver = {
			name: "boom",
			available: async () => true,
			resolve: vi.fn().mockRejectedValue(new Error("nope")),
		};
		await expect(mergeWithStrategy(baseInput("a.md"), resolver, cfg)).rejects.toThrow("nope");
	});
});

// A realistic markdown file: enough lines that the overlap check applies.
const DOC = Array.from({ length: 40 }, (_, i) => `- rule ${i}: keep the build green`).join("\n");
const LOCAL_DOC = `# Guide\n\n${DOC}\n- local addition\n`;
const REMOTE_DOC = `# Guide\n\n${DOC}\n- remote addition\n`;
// What the claude resolver actually returned when it was handed a path.
const REFUSAL = [
	"I can't read that file -- it's outside this session's allowed working directories.",
	"",
	"Allowed: C:Usersme.claudeprojects",
	"Requested: C:UsersmeAppDataLocalTempai-sync-merge-32152-e64bdd87771aprompt.txt",
	"",
	"Either paste the contents here or re-run in an interactive session.",
].join("\n");

describe("looksLikeMerge()", () => {
	it("accepts a genuine merge of both sides", () => {
		const merged = `# Guide\n\n${DOC}\n- local addition\n- remote addition\n`;
		expect(looksLikeMerge(merged, `# Guide\n\n${DOC}\n`, LOCAL_DOC, REMOTE_DOC)).toBe(true);
	});

	it("rejects a resolver reply that names its scratch dir", () => {
		expect(looksLikeMerge(REFUSAL, null, "a", "b")).toBe(false);
	});

	it("allows scratch-dir text when the inputs already contain it", () => {
		const doc = "Prompts live in prompt.txt\n";
		expect(looksLikeMerge(doc, null, doc, doc)).toBe(true);
	});

	it("rejects prose that shares almost no lines with the inputs", () => {
		const prose = "I need more context.\nCould you paste the file?\nThen I can merge it.\n";
		expect(looksLikeMerge(prose, null, LOCAL_DOC, REMOTE_DOC)).toBe(false);
	});

	it("rejects output far shorter than the shorter side", () => {
		const merged = `# Guide\n\n${DOC.split("\n").slice(0, 3).join("\n")}\n`;
		expect(LOCAL_DOC.length).toBeGreaterThan(1000);
		expect(looksLikeMerge(merged, null, LOCAL_DOC, REMOTE_DOC)).toBe(false);
	});

	it("skips the overlap and length checks for tiny inputs", () => {
		expect(looksLikeMerge("entirely new text\n", "B", "L", "R")).toBe(true);
	});

	it("ignores CRLF vs LF when matching lines", () => {
		const merged = LOCAL_DOC.replace(/\n/g, "\r\n");
		expect(looksLikeMerge(merged, null, LOCAL_DOC, REMOTE_DOC)).toBe(true);
	});
});

describe("mergeWithStrategy() freeform sanity", () => {
	const cfg = defaultMergeConfig();

	it("returns ok=false reason=freeform-sanity when markdown output is a refusal", async () => {
		const r = fakeResolver(REFUSAL);
		const result = await mergeWithStrategy(
			{
				relativePath: "README.md",
				envName: "claude",
				base: null,
				local: LOCAL_DOC,
				remote: REMOTE_DOC,
			},
			r,
			cfg,
		);
		expect(result.ok).toBe(false);
		expect(!result.ok && result.reason).toBe("freeform-sanity");
	});
});
