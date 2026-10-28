import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll } from "vitest";

/**
 * Global test setup: give git a deterministic author/committer identity.
 *
 * Several integration tests commit through the product code (init command,
 * commitFiles). CI runners have no global git `user.name` / `user.email`, so
 * those commits fail with "Author identity unknown" -- even though they pass
 * locally where a developer's global git config supplies one.
 *
 * We set the identity via env vars rather than `git config --global` so we
 * never mutate the real user's git configuration, and so every git child
 * process -- both execSync() and simple-git -- inherits it automatically.
 * The `??=` guards let a caller override the identity if they ever need to.
 */
process.env.GIT_AUTHOR_NAME ??= "ai-sync test";
process.env.GIT_AUTHOR_EMAIL ??= "test@ai-sync.invalid";
process.env.GIT_COMMITTER_NAME ??= "ai-sync test";
process.env.GIT_COMMITTER_EMAIL ??= "test@ai-sync.invalid";

/**
 * Default new repos to `main` regardless of the runner's git version or config.
 *
 * Several fixtures `git init` a (bare) repo and then push/clone `main`. On a
 * runner that still defaults to `master`, the bare repo's HEAD points at an
 * unborn `master`, so a later clone-and-`push origin main` fails with
 * "src refspec main does not match any". Injecting init.defaultBranch via the
 * GIT_CONFIG_* env vars sets it globally for every git child process without
 * touching the user's real gitconfig, and fixes all such fixtures at once.
 */
/**
 * Sandbox the home directory so no test can touch the developer's real config.
 *
 * Several code paths resolve config dirs from the environment rather than from
 * options -- e.g. the link/unlink, push, and pull commands call
 * getEnabledEnvironmentInstances(), whose getConfigDir() is os.homedir()-based.
 * A test that drove `link` through the CLI once moved the real ~/.claude into
 * its temp dir and then deleted it in afterEach, wiping the developer's config.
 *
 * os.homedir() reads HOME on POSIX and USERPROFILE on Windows; the OpenCode and
 * Codex envs prefer XDG_CONFIG_HOME / CODEX_HOME when set, so those are cleared
 * to fall back to the sandboxed home. setupFiles run before each test file's
 * imports, so every module sees the sandbox.
 */
const realHome = os.homedir();
const sandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-test-home-"));
process.env.HOME = sandboxHome;
process.env.USERPROFILE = sandboxHome;
delete process.env.XDG_CONFIG_HOME;
delete process.env.CODEX_HOME;

// Fail closed: abort the run rather than risk the real home if redirection failed.
if (os.homedir() !== sandboxHome || os.homedir() === realHome) {
	throw new Error(
		`Test home sandbox failed: os.homedir() is ${os.homedir()}, expected ${sandboxHome}`,
	);
}

afterAll(() => {
	fs.rmSync(sandboxHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

if (process.env.GIT_CONFIG_COUNT === undefined) {
	process.env.GIT_CONFIG_COUNT = "1";
	process.env.GIT_CONFIG_KEY_0 = "init.defaultBranch";
	process.env.GIT_CONFIG_VALUE_0 = "main";
}
