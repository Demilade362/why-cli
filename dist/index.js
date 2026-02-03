#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import path from "node:path";
import fs from "node:fs";
import { resolveTargetVariants } from "./lib/paths.js";
import { scanImporters, HardIgnore } from "./lib/scan.js";
import { computeImpact } from "./lib/impact.js";
import { getGitOrigin } from "./lib/git.js";
const program = new Command();
program
    .name("why")
    .description("Explain why a file exists by showing who references it")
    .argument("<file>", "Path to a file in the current repo")
    .option("--cwd <path>", "Working directory", process.cwd())
    .option("--show-lines", "Show matching source lines", false)
    .option("--json", "Output machine-readable JSON", false)
    .option("--max <n>", "Max importer files to display", (v) => parseInt(v, 10), 50)
    .option("--transitive", "Also compute transitive importers (v2)", false)
    .action(async (file, opts) => {
    try {
        const cwd = path.resolve(opts.cwd);
        const { abs, rel, variants } = resolveTargetVariants(cwd, file);
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
            console.error(pc.red(`Target not found or not a file: ${file}`));
            process.exit(1);
        }
        const refs = scanImporters(cwd, variants, {
            hardIgnore: HardIgnore,
            targetAbs: abs,
        });
        // Aggregate by file
        const byFile = new Map();
        for (const r of refs) {
            const arr = byFile.get(r.file) ?? [];
            arr.push(r);
            byFile.set(r.file, arr);
        }
        const importerFiles = byFile.size;
        const totalRefs = refs.length;
        const importance = computeImpact(importerFiles, totalRefs);
        const git = await getGitOrigin(cwd, abs, rel);
        if (opts.json) {
            const out = {
                file: { abs, rel },
                direct: {
                    importerFiles,
                    totalRefs,
                    byFile: Array.from(byFile.entries()).map(([f, hits]) => ({
                        file: f,
                        count: hits.length,
                        matches: hits.slice(0, 5).map((h) => ({ line: h.line, text: h.text })),
                    })),
                },
                impact: { importance },
                git: git ?? null,
            };
            console.log(JSON.stringify(out, null, 2));
            process.exit(0);
        }
        // Human readable output
        console.log(pc.bold("File:"), pc.cyan(rel));
        console.log(pc.dim("Searching references to:"), variants.map((v) => pc.yellow(v)).join(", "));
        if (refs.length === 0) {
            console.log(pc.green("\nNo direct import/require references found."));
            console.log(pc.dim("Note: v1 does not detect dynamic paths or custom resolvers."));
            process.exit(0);
        }
        console.log(pc.bold(`\nDirect importers (${importerFiles} files, ${totalRefs} refs):`));
        // Sort files by hit count desc
        const sorted = Array.from(byFile.entries()).sort((a, b) => b[1].length - a[1].length);
        const cap = Math.max(0, Number(opts.max) || 50);
        let shown = 0;
        for (const [f, hits] of sorted) {
            if (shown >= cap)
                break;
            console.log(`- ${pc.cyan(f)} ${pc.dim(`(${hits.length})`)}`);
            if (opts.showLines) {
                for (const h of hits.slice(0, 5)) {
                    console.log(pc.dim(`  L${h.line}: ${h.text}`));
                }
                if (hits.length > 5) {
                    console.log(pc.dim(`  … +${hits.length - 5} more`));
                }
            }
            shown++;
        }
        if (importerFiles > cap) {
            console.log(pc.dim(`\n  … +${importerFiles - cap} more files omitted (use --max to increase)`));
        }
        console.log(`\n${pc.bold("Impact:")}`);
        console.log(`- Importer files: ${importerFiles}`);
        console.log(`- Total refs: ${totalRefs}`);
        console.log(`- Importance: ${pc.bold(importance)}`);
        console.log(`\n${pc.bold("Git origin:")}`);
        if (git) {
            console.log(`- First seen: ${pc.cyan(git.commit)} (${pc.dim(git.date)}) ${pc.dim(git.subject)}`);
        }
        else {
            console.log(pc.dim("- Git origin not found or repository unavailable."));
        }
        if (opts.transitive) {
            console.log(pc.dim("\nNote: --transitive is scaffolded in v1 and will be available in v2."));
        }
        process.exit(0);
    }
    catch (err) {
        console.error(pc.red("Unexpected error:"), err?.message ?? String(err));
        process.exit(2);
    }
});
program.parse(process.argv);
