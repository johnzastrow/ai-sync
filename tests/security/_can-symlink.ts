import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Runtime probe: can this process create symlinks?
 *
 * On Windows, `fs.symlink` requires either administrator privileges or
 * Developer Mode. CI runners and most dev machines without Developer Mode
 * return EPERM. Tests that rely on symlinks should be skipped — and the
 * production defenses remain in place either way; what we lose is local
 * test coverage on those machines.
 */
export const canCreateSymlinks: boolean = (() => {
	const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-probe-"));
	const target = path.join(probeDir, "target");
	const link = path.join(probeDir, "link");
	try {
		fs.writeFileSync(target, "");
		fs.symlinkSync(target, link);
		return true;
	} catch {
		return false;
	} finally {
		try {
			fs.rmSync(probeDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup failure
		}
	}
})();
