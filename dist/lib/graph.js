import fg from "fast-glob";
import fs from "node:fs";
import path from "node:path";
import { normalizeToPosix, stripExt } from "./paths.js";
import { getRepoIgnore } from "./scan.js";
function extractSpecifiers(text) {
    const lines = text.split(/\r?\n/);
    const hits = [];
    const re = /(?:from\s*|import\s*\(\s*|require\s*\(\s*|export\s+.*\sfrom\s*)(["'`])([^"'`]+)\1/g;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let m;
        re.lastIndex = 0;
        while ((m = re.exec(line)) !== null) {
            const spec = m[2];
            hits.push({ spec, line: i + 1, text: line.trim().slice(0, 200) });
        }
    }
    return hits;
}
function tryResolveRelative(importerDir, spec) {
    // Resolve a relative specifier to a repository-relative posix path if file exists
    const abs = path.resolve(importerDir, spec);
    const candidates = [];
    const base = abs;
    candidates.push(base);
    const exts = [".js", ".ts", ".mjs", ".cjs", ".jsx", ".tsx"];
    // If the spec already contains an extension (e.g. ./target.js) try the
    // spec as-is, but also try resolving by stripping the extension and
    // testing common source extensions (./target -> ./target.ts, ./target.js -> ./target.ts)
    const baseNoExt = base.replace(/\.[^/.]+$/, "");
    candidates.push(baseNoExt);
    for (const e of exts) {
        candidates.push(baseNoExt + e);
    }
    // also try the original base with added extensions (covers cases like './target' -> './target.js')
    for (const e of exts)
        candidates.push(base + e);
    // index variants
    for (const e of exts) {
        candidates.push(path.join(base, "index" + e));
        candidates.push(path.join(baseNoExt, "index" + e));
    }
    candidates.push(path.join(base, "index.js"));
    for (const c of candidates) {
        if (fs.existsSync(c) && fs.statSync(c).isFile()) {
            return normalizeToPosix(path.relative(process.cwd(), c));
        }
    }
    return null;
}
export function buildImportGraph(cwd, opts = {}) {
    const ig = getRepoIgnore(cwd, opts.hardIgnore ?? []);
    const patterns = ["**/*.{ts,tsx,js,jsx,mjs,cjs}", "**/*.{mts,cts}"]; // limited set
    const allFiles = fg.sync(patterns, { cwd, onlyFiles: true });
    const files = allFiles.filter((f) => !ig.ignores(f));
    const importsMap = new Map();
    const specHitsMap = new Map();
    for (const file of files) {
        const full = path.join(cwd, file);
        let text;
        try {
            text = fs.readFileSync(full, "utf8");
        }
        catch {
            continue;
        }
        const hits = extractSpecifiers(text);
        if (hits.length === 0)
            continue;
        const importerDir = path.dirname(full);
        const relFile = normalizeToPosix(file);
        specHitsMap.set(relFile, hits);
        for (const h of hits) {
            const spec = h.spec;
            // Only resolve relative imports for now
            if (spec.startsWith(".")) {
                const resolved = tryResolveRelative(importerDir, spec);
                if (resolved) {
                    const set = importsMap.get(relFile) ?? new Set();
                    set.add(resolved);
                    importsMap.set(relFile, set);
                }
            }
        }
    }
    return { importsMap, specHitsMap };
}
export function findDirectImportersForTarget(cwd, targetRel, graph) {
    const { importsMap, specHitsMap } = graph;
    const byFile = new Map();
    for (const [file, deps] of importsMap.entries()) {
        const hits = specHitsMap.get(file) ?? [];
        if (hits.length === 0)
            continue;
        const importerAbsDir = path.dirname(path.join(cwd, file));
        const matched = [];
        for (const h of hits) {
            // resolve the specifier from the importer's directory and compare
            if (!h.spec || !h.spec.startsWith("."))
                continue;
            const resolved = tryResolveRelative(importerAbsDir, h.spec);
            if (!resolved)
                continue;
            const depNoExt = stripExt(resolved);
            const targetNoExt = stripExt(targetRel);
            if (resolved === targetRel || depNoExt === targetRel || resolved === targetNoExt || depNoExt === targetNoExt) {
                matched.push({ file, line: h.line, text: h.text });
            }
        }
        if (matched.length > 0) {
            const arr = byFile.get(file) ?? [];
            arr.push(...matched);
            byFile.set(file, arr);
        }
    }
    return { byFile, totalRefs: Array.from(byFile.values()).reduce((s, a) => s + a.length, 0) };
}
export function findTransitiveImporters(target, graph, maxDepth = 10) {
    const { importsMap } = graph;
    // Build reverse map
    const reverse = new Map();
    for (const [file, deps] of importsMap.entries()) {
        for (const d of deps) {
            const set = reverse.get(d) ?? new Set();
            set.add(file);
            reverse.set(d, set);
        }
    }
    const q = [];
    const seen = new Set();
    const result = new Map();
    q.push({ file: target, depth: 0 });
    seen.add(target);
    while (q.length > 0) {
        const cur = q.shift();
        if (cur.depth >= maxDepth)
            continue;
        const parents = reverse.get(cur.file) ?? new Set();
        for (const p of parents) {
            if (seen.has(p))
                continue;
            const d = cur.depth + 1;
            const set = result.get(d) ?? new Set();
            set.add(p);
            result.set(d, set);
            seen.add(p);
            q.push({ file: p, depth: d });
        }
    }
    return result; // Map depth -> Set<file>
}
