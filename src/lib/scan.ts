import fg from "fast-glob";
import ignore from "ignore";
import fs from "node:fs";
import path from "node:path";

import type { FoundRef, ScanOptions } from "../types.js";
import { looksLikeReference } from "./imports.js";

export const HardIgnore = [
  "node_modules/",
  "dist/",
  "build/",
  ".next/",
  ".turbo/",
  ".git/",
  "coverage/",
];

function getRepoIgnore(cwd: string, extra: string[] = []) {
  // Some type declarations expose ignore as a namespace. Cast to any to call.
  const ig = (ignore as any)();
  const gitignorePath = path.join(cwd, ".gitignore");

  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, "utf8");
      ig.add(content);
    } catch {
      // ignore
    }
  }

  ig.add([...HardIgnore, ...extra]);
  return ig;
}

export function scanImporters(cwd: string, targetVariants: string[], opts: ScanOptions = {}): FoundRef[] {
  const ig = getRepoIgnore(cwd, opts.hardIgnore ?? []);

  const patterns = [
    "**/*.{ts,tsx,js,jsx,mjs,cjs}",
    "**/*.{mts,cts}",
    // include some other common source-ish files
    "**/*.{py,go,rs,java,kt,php,rb}",
  ];

  const allFiles = fg.sync(patterns, { cwd, onlyFiles: true });
  const files = allFiles.filter((f) => !ig.ignores(f));

  const found: FoundRef[] = [];

  for (const file of files) {
    const full = path.join(cwd, file);
    let text: string;
    try {
      text = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);

    // Build importer-relative variants to match succinct imports like "./target.js"
    const importerDirAbs = path.dirname(path.join(cwd, file));
    const relVariants = new Set<string>(targetVariants);
    if (opts.targetAbs) {
      const relFromImporter = normalizeToPosix(path.relative(importerDirAbs, opts.targetAbs));
      const relNoExt = relFromImporter.replace(/\.[a-zA-Z0-9]+$/, "");

      const addSpec = (s: string | undefined) => {
        if (!s) return;
        relVariants.add(s);
        if (!s.startsWith("./") && !s.startsWith("../") && !s.startsWith("/")) relVariants.add("./" + s);
        const base = s.replace(/\.[a-zA-Z0-9]+$/, "");
        // add common extension variants and their ./ prefixed forms
        relVariants.add(base + ".js");
        relVariants.add("./" + base + ".js");
        relVariants.add(base + ".ts");
        relVariants.add("./" + base + ".ts");
      };

      addSpec(relFromImporter);
      addSpec(relNoExt);
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let matched = false;
      for (const spec of relVariants) {
        if (looksLikeReference(line, spec)) {
          found.push({ file: normalizeToPosix(file), line: i + 1, text: line.trim().slice(0, 200) });
          matched = true;
          break;
        }
      }
      if (matched) continue;
    }
  }

  return found;
}

function normalizeToPosix(p: string) {
  return p.split(path.sep).join("/");
}
