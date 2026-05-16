import { defineConfig } from "vitest/config";

// Git operations on Windows are markedly slower than on POSIX (filesystem
// locks, antivirus inspection, NTFS handle release lag). The init/push/pull
// integration tests legitimately spend 4-30s end-to-end on Windows, so the
// default vitest timeout of 5000ms is too tight. Linux/macOS keep the
// default to surface real hangs.
const testTimeout = process.platform === "win32" ? 60_000 : 5_000;

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["tests/**/*.test.ts"],
		testTimeout,
		hookTimeout: testTimeout,
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
		},
	},
});
