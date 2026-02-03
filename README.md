# why-analysis-cli

[![npm version](https://img.shields.io/npm/v/why-cli.svg)](https://www.npmjs.com/package/why-cli)
[![CI](https://github.com/Demilade362/why-cli/actions/workflows/publish.yml/badge.svg)](https://github.com/Demilade362/why-cli/actions)

`why` is a small Node.js CLI that helps you answer the question: why does this file exist?
It scans a repository for direct importers of a target file, estimates impact, and extracts the file's git origin.

Features
- Find direct importers (import/require/export/dynamic import)
- Generate a simple importance score (HIGH/MEDIUM/LOW)
- Extract first-seen commit via `git` if available
- Outputs pretty terminal output (picocolors) or machine-readable JSON

Install

Global (recommended for CLI use):

```bash
npm install -g why-analysis-cli
```

Run from source (dev):

```bash
npm install
npm run dev -- ./src/demo/target.ts --show-lines
```

Usage

```text
why <file> [--cwd <path>] [--show-lines] [--json] [--max <n>] [--transitive]
```

Example

```bash
node dist/index.js ./src/demo/target.ts --show-lines
```

Output (text):

File: src/demo/target.ts
Direct importers (2 files, 2 refs):
- src/demo/userA.ts (1)
  L1: import { add } from "./target.js";
- src/demo/userB.ts (1)
  L1: import { add } from "./target.js";

Impact:
- Importer files: 2
- Total refs: 2
- Importance: LOW

Git origin:
- Git origin not found or repository unavailable.

Publishing

1. Update `package.json` repository fields and README with your GitHub repo details.
2. Build: `npm run build`
3. Login to npm: `npm login`
4. Publish: `npm publish --access public`

CI-based publish

I included a GitHub Actions workflow that will publish on git tag pushes (`v*.*.*`). You need to add an `NPM_TOKEN` secret to your repository settings.

License

MIT — see `LICENSE`.
