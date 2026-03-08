import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		cli: "src/cli/index.ts",
		index: "src/index.ts",
	},
	format: ["esm"],
	dts: true,
	clean: true,
	target: "node22",
	banner: {
		js: "#!/usr/bin/env node",
	},
});
