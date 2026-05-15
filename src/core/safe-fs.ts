import * as fs from "node:fs/promises";
import * as path from "node:path";

// Available on POSIX, undefined on Windows. The `?? 0` fallback below lets the
// flag be a no-op on platforms that do not support it; the lstat-then-unlink
// dance still prevents writes through a symlink that exists at call time.
const O_NOFOLLOW: number | undefined = (fs as unknown as { constants?: { O_NOFOLLOW?: number } })
	.constants?.O_NOFOLLOW;

/**
 * Returns true iff `child` is equal to `parent` or strictly contained inside it.
 * Operates on raw path strings — callers are responsible for resolving realpaths
 * before passing them in if symlink resolution matters.
 */
export function isInside(parent: string, child: string): boolean {
	const rel = path.relative(parent, child);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export interface SafeWriteOptions {
	/** When set, the destination's permission mode is taken from this source path. */
	preserveModeFromSrc?: string;
}

/**
 * Writes `content` to `relPath` inside `rootReal`, refusing any operation that
 * would resolve outside the root.
 *
 * Defenses (in order):
 * 1. Resolves the destination directory's realpath after `mkdir -p` and refuses
 *    if it sits outside `rootReal` — catches a pre-existing directory symlink.
 * 2. Unlinks any symlink at the final destination before opening — catches a
 *    symlink committed in the sync repo or pre-existing on disk.
 * 3. Opens with `O_NOFOLLOW` on POSIX so a symlink racing into place between
 *    the lstat and the open fails the open with ELOOP.
 * 4. Optional `preserveModeFromSrc` copies the source file's mode masked to
 *    `0o777` — preserves the executable bit on hook scripts but strips
 *    setuid/setgid/sticky.
 */
export async function safeWriteInside(
	rootReal: string,
	relPath: string,
	content: string,
	options?: SafeWriteOptions,
): Promise<void> {
	const dest = path.join(rootReal, relPath);
	const destDir = path.dirname(dest);
	await fs.mkdir(destDir, { recursive: true });

	const destDirReal = await fs.realpath(destDir);
	if (!isInside(rootReal, destDirReal)) {
		throw new Error(`Refusing to write outside ${rootReal}: ${dest} resolves to ${destDirReal}`);
	}

	try {
		const lst = await fs.lstat(dest);
		if (lst.isSymbolicLink()) {
			await fs.unlink(dest);
		}
	} catch {
		// destination doesn't exist yet — nothing to clear
	}

	const flags =
		fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | (O_NOFOLLOW ?? 0);

	const fh = await fs.open(dest, flags);
	try {
		await fh.writeFile(content);
		if (options?.preserveModeFromSrc) {
			const stat = await fs.stat(options.preserveModeFromSrc);
			await fh.chmod(stat.mode & 0o777);
		}
	} finally {
		await fh.close();
	}
}
