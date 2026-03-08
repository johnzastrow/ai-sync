# Stack Research

**Domain:** Cross-platform dotfile/config synchronization CLI tool
**Researched:** 2026-03-08
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | >=22.x LTS | Runtime | v22 is in Maintenance LTS (until April 2027). Provides native `fs.watch` with recursive support on macOS/Windows, native TypeScript stripping via `--experimental-strip-types`, and stable ESM support. The tool targets developer machines where Node.js is already present for Claude Code. |
| TypeScript | ~5.9.3 | Type safety | Current stable release. Provides strong typing for config schemas, Git operation wrappers, and cross-platform path handling. TypeScript 6.0 RC just landed (March 2026) but is too fresh for production; stick with 5.9.x. |
| Commander.js | ^14.0.2 | CLI framework | 14.x is the current stable line with CJS+ESM dual support. Lightweight (no bloat), excellent TypeScript types, well-documented. Commander 15 (ESM-only) ships May 2026 -- premature to adopt. Commander beats alternatives because this tool has simple commands (`sync`, `status`, `watch`, `setup`), not a complex subcommand tree that would justify oclif's weight. |
| simple-git | ^3.32.3 | Git operations | The standard Node.js Git library with 6M+ weekly downloads. Wraps git CLI with a promise-based API. Supports all operations needed: clone, pull, push, add, commit, status, diff. TypeScript types included. Actively maintained (last publish: Feb 2026). |

### File Watching

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| chokidar | ^4.0.3 | File system watching | Use v4, NOT v5. v4 supports both CJS and ESM, reduced dependencies from 13 to 1, and requires Node.js >=14. v5 (Nov 2025) is ESM-only which constrains downstream consumers. Native `fs.watch` recursive mode has known stability issues on Linux (inotify race conditions, crash bugs in Node 20/22). Chokidar normalizes cross-platform differences and handles edge cases (atomic writes, editor temp files, etc.). |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^4.3.6 | Config schema validation | Validate `settings.json`, sync config, and any structured data. TypeScript-first with static type inference -- define the schema once, get the type for free. 96M+ weekly downloads; this is the standard. |
| picocolors | ^1.1.1 | Terminal output coloring | 14x smaller and 2x faster than chalk. Zero dependencies. For a CLI that outputs status messages and diffs, this is all you need. No need for chalk's heavier API surface. |
| ora | ^9.3.0 | Terminal spinners | Show progress during git operations (clone, push, pull). ESM-only in v9 but that is fine since our tool will be ESM. Use sparingly -- only for operations that take >500ms. |
| conf | ^13.0.0 | Tool-internal config storage | Stores the tool's own configuration (remote URL, sync interval, last sync timestamp) in `~/.config/claude-sync/`. Cross-platform, supports migrations, atomic writes. Do NOT use this for the synced config -- only for the sync tool's own settings. |

### Development Tools

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| tsup | ^8.5.0 | TypeScript bundler | Bundles to CJS+ESM with zero config. Yes, tsup is in maintenance mode and tsdown is the successor, but tsdown is at 0.20.x (pre-1.0) and requires Node >=20.19. tsup is battle-tested, stable, and will receive security patches. For a small CLI tool, tsup is the pragmatic choice today. |
| vitest | ^4.0.18 | Test runner | The standard test runner for TypeScript projects in 2025/2026. Native TypeScript support, fast execution, excellent watch mode for development. Jest is legacy at this point. |
| Biome | ^2.x | Linter + Formatter | Replaces ESLint + Prettier with a single Rust-powered tool. 10-25x faster, one config file instead of four. For a new project with no legacy ESLint config to migrate, Biome is the obvious choice. Type-aware linting covers ~85% of typescript-eslint, which is sufficient for a CLI tool (not a complex web app). |

## Installation

```bash
# Core dependencies
npm install commander simple-git chokidar zod picocolors ora conf

# Dev dependencies
npm install -D typescript tsup vitest @biomejs/biome @types/node
```

## Project Configuration

```json
// package.json (key fields)
{
  "type": "module",
  "engines": { "node": ">=22.0.0" },
  "bin": { "claude-sync": "./dist/cli.js" },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
}
```

```json
// tsconfig.json (key fields)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Commander.js | oclif | If the CLI grows to 15+ subcommands with complex plugin architecture. For a 4-5 command tool, oclif adds unnecessary complexity (class-based commands, plugin system, heavy scaffolding). |
| Commander.js | yargs | If you prefer object-based config over fluent API. Commander has better TypeScript ergonomics and is more actively maintained. |
| simple-git | execa + raw git commands | If you need git operations not covered by simple-git (rare). Execa v9.6.1 is excellent for process execution but simple-git's typed API prevents mistakes and handles edge cases. |
| simple-git | isomorphic-git | If you need git operations without requiring git to be installed. But all target machines (developer workstations) have git, and isomorphic-git has incomplete support for some operations. |
| chokidar | Node.js native fs.watch | When targeting only macOS/Windows AND using Node >=22. Native `fs.watch` recursive mode crashes on Linux under certain conditions (file deletion races) and has inconsistent event reporting across platforms. Not worth the risk for a cross-platform tool. |
| chokidar v4 | chokidar v5 | If your project is ESM-only with no CJS consumers AND you target Node >=20. v5 is fine technically but v4 is more compatible and equally functional for our needs. |
| tsup | tsdown | When tsdown reaches 1.0 (likely mid-2026). Currently at 0.20.x, API is not yet stable. Powered by Rolldown (Rust) and will be faster, but stability matters more than build speed for a CLI tool. |
| Biome | ESLint + Prettier | If you need highly specific lint rules (custom plugins, Airbnb/Google style guide enforcement). For a small-to-medium TypeScript project, Biome's built-in rules are sufficient and the DX is far superior. |
| picocolors | chalk | If you need advanced features like template literals, hex color support, or 256-color mode. For basic status output (green/red/yellow), picocolors is all you need. |
| vitest | Node.js native test runner | If you want zero test dependencies. Node's built-in test runner (node:test) is capable but lacks vitest's TypeScript integration, watch mode quality, and snapshot testing. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| isomorphic-git | Incomplete operation support, slower than native git, unnecessary since all target machines have git installed | simple-git (wraps native git) |
| chalk v5+ | ESM-only, large for what it does, no features you need beyond picocolors | picocolors |
| nodemon | Heavy, designed for server restart not file sync, pulls in many dependencies | chokidar (direct file watching) |
| dotenv | No environment variables in this tool -- config is the payload, not secrets | zod for config validation |
| Prettier + ESLint combo | Two tools, four config files, 127+ transitive packages, slow | Biome (single tool, single config) |
| tsdown (today) | Pre-1.0, unstable API, requires Node >=20.19, only 96 npm dependents | tsup (stable, battle-tested) |
| ts-node | Slow startup, complex configuration, unnecessary when tsup compiles ahead of time | tsup for building, vitest for testing |
| GNU Stow | Shell-based, not programmable, requires separate installation, symlink-based approach is fragile | Git bare repo pattern via simple-git |
| Bun runtime | Not installed on most developer machines, WSL support is mixed, Node.js is already a requirement for Claude Code | Node.js 22 LTS |

## Stack Patterns by Variant

**If the tool grows to need a daemon/background process:**
- Use Node.js `child_process.fork()` for the watcher daemon
- Store PID in the conf-managed config directory
- Do NOT pull in pm2 or forever -- overkill for a single-process file watcher

**If git authentication becomes needed (private repos):**
- Rely on the system's git credential helper (already configured on developer machines)
- simple-git inherits system git config including credential helpers
- Do NOT implement custom SSH key handling or token management

**If the tool needs to handle merge conflicts:**
- Use simple-git's merge/diff APIs to detect conflicts
- Present conflicts in the terminal with picocolors highlighting
- Let the user resolve manually -- do NOT auto-resolve config conflicts

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| simple-git@3.32.x | Node.js >=18 | Works on all target Node versions |
| commander@14.x | Node.js >=18 | CJS+ESM dual support; v15 (ESM-only) ships May 2026 |
| chokidar@4.x | Node.js >=14 | Broad compatibility, CJS+ESM dual mode |
| zod@4.x | Node.js >=18 | Major version bump from v3; new API surface but migration is straightforward |
| tsup@8.x | Node.js >=18 | Powered by esbuild; maintenance mode but stable |
| vitest@4.x | Node.js >=20 | Requires Node 20+; fine since we target Node 22 |
| Biome@2.x | Node.js >=16 | Single binary, minimal runtime requirements |
| ora@9.x | Node.js >=20 | ESM-only; fine for our ESM project |

## Sources

- [simple-git on npm](https://www.npmjs.com/package/simple-git) -- version 3.32.3, weekly downloads, maintenance status (HIGH confidence)
- [commander on npm](https://www.npmjs.com/package/commander) -- version 14.0.2, v15 ESM-only timeline (HIGH confidence)
- [chokidar on GitHub](https://github.com/paulmillr/chokidar) -- v4 vs v5 breaking changes, ESM-only in v5 (HIGH confidence)
- [Node.js recursive fs.watch Linux issues](https://github.com/nodejs/node/issues/48437) -- crash bugs on Linux, inotify limitations (HIGH confidence)
- [Node.js releases](https://nodejs.org/en/about/previous-releases) -- v22.22.1 LTS, maintenance until April 2027 (HIGH confidence)
- [TypeScript releases](https://github.com/microsoft/typescript/releases) -- v5.9.3 stable, v6.0 RC March 2026 (HIGH confidence)
- [vitest on npm](https://www.npmjs.com/package/vitest) -- v4.0.18 (HIGH confidence)
- [tsup on GitHub](https://github.com/egoist/tsup) -- maintenance status, tsdown as successor (MEDIUM confidence)
- [tsdown on npm](https://www.npmjs.com/package/tsdown) -- v0.20.3, pre-1.0 (HIGH confidence)
- [Biome vs ESLint comparison](https://betterstack.com/community/guides/scaling-nodejs/biome-eslint/) -- performance benchmarks, feature coverage (MEDIUM confidence)
- [picocolors on npm](https://www.npmjs.com/package/picocolors) -- v1.1.1, size/speed comparison vs chalk (HIGH confidence)
- [zod on npm](https://www.npmjs.com/package/zod) -- v4.3.6, 96M+ weekly downloads (HIGH confidence)
- [Dotfiles bare git repo approach](https://www.atlassian.com/git/tutorials/dotfiles) -- community consensus on bare repo vs symlinks (MEDIUM confidence)
- [ora on npm](https://www.npmjs.com/package/ora) -- v9.3.0 (HIGH confidence)

---
*Stack research for: Claude Config Sync -- cross-platform ~/.claude synchronization tool*
*Researched: 2026-03-08*
