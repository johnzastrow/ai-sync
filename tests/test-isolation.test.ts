import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_ENVIRONMENTS } from "../src/core/environment.js";

/**
 * Regression guard for tests/setup.ts: every environment's config dir must
 * resolve inside the sandboxed temp home, never the developer's real one.
 */
describe("test home isolation", () => {
	it("runs with os.homedir() inside the temp dir", () => {
		const home = os.homedir();
		expect(path.basename(home)).toMatch(/^ai-sync-test-home-/);
		expect(path.relative(os.tmpdir(), home).startsWith("..")).toBe(false);
	});

	it.each(
		ALL_ENVIRONMENTS.map((env) => [env.id, env] as const),
	)("resolves the %s config dir inside the sandboxed home", (_id, env) => {
		const rel = path.relative(os.homedir(), env.getConfigDir());
		expect(rel.startsWith("..") || path.isAbsolute(rel)).toBe(false);
	});
});
