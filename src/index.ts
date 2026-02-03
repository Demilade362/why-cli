#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import path from "node:path";
import fs from "node:fs";

import { resolveTargetVariants } from "./lib/paths.js";
import { scanImporters, HardIgnore } from "./lib/scan.js";
import { buildImportGraph, findDirectImportersForTarget, findTransitiveImporters } from "./lib/graph.js";
import { computeImpact } from "./lib/impact.js";
import { getGitOrigin } from "./lib/git.js";
import type { FoundRef } from "./types.js";

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
  .action(async (file: string, opts: any) => {
    try {
      const cwd = path.resolve(opts.cwd);
      const { abs, rel, variants } = resolveTargetVariants(cwd, file);

      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        console.error(pc.red(`Target not found or not a file: ${file}`));
        process.exit(1);
      }

      // collect direct importers either via fast scan or the import graph
      let byFile = new Map<string, FoundRef[]>();
      let totalRefs = 0;
      let importance: ReturnType<typeof computeImpact> = computeImpact(0, 0);
      let transitiveMap: Map<number, Set<string>> | null = null;

      if (opts.transitive) {
        const graph = buildImportGraph(cwd, { hardIgnore: HardIgnore });
        const direct = findDirectImportersForTarget(cwd, rel, graph);
        byFile = direct.byFile;
        totalRefs = direct.totalRefs;
        importance = computeImpact(byFile.size, totalRefs);
        transitiveMap = findTransitiveImporters(rel, graph, 6);
      } else {
        const refs: FoundRef[] = scanImporters(cwd, variants, {
          hardIgnore: HardIgnore,
          targetAbs: abs,
        });

        byFile = new Map<string, FoundRef[]>();
        for (const r of refs) {
          const arr = byFile.get(r.file) ?? [];
          arr.push(r);
          byFile.set(r.file, arr);
        }

        totalRefs = refs.length;
        importance = computeImpact(byFile.size, totalRefs);
      }

      const git = await getGitOrigin(cwd, abs, rel);

      if (opts.json) {
        const out: any = {
          file: { abs, rel },
          direct: {
            importerFiles: byFile.size,
            totalRefs,
            byFile: Array.from(byFile.entries()).map(([f, hits]) => ({ file: f, count: hits.length, matches: hits.slice(0, 5).map((h) => ({ line: h.line, text: h.text })) })),
          },
          impact: { importance },
          git: git ?? null,
        };
        if (transitiveMap) out.transitive = Array.from(transitiveMap.entries()).map(([depth, set]) => ({ depth, files: Array.from(set) }));
        console.log(JSON.stringify(out, null, 2));
        process.exit(0);
      }

      // HUMAN output (eye-catching)
      const BAR = "═".repeat(58);
      console.log(pc.magenta(BAR));
      console.log(
        pc.bold(pc.cyan(`  🔎  WHY — ${rel}`)),
        pc.dim(`  (${variants.map((v) => v).join(", ")})`)
      );
      console.log(pc.magenta(BAR.replace(/./g, "─")));

      if (totalRefs === 0) {
        console.log(pc.green("\n  ✅ No direct import/require references found."));
        console.log(pc.dim("  Note: v1 does not detect dynamic paths or custom resolvers."));
        process.exit(0);
      }

      // Direct importers panel
      console.log();
      console.log(pc.bold(pc.yellow("  📦 Direct importers  ")) + pc.dim(" — " + String(byFile.size) + " files · " + String(totalRefs) + " references"));
      console.log(pc.dim("  ─".repeat(40)));

      const sorted = Array.from(byFile.entries()).sort((a, b) => b[1].length - a[1].length);
      const cap = Math.max(0, Number(opts.max) || 50);
      let shown = 0;

      for (const [f, hits] of sorted) {
        if (shown >= cap) break;
        const count = hits.length;
        console.log("  " + pc.magenta("•") + " " + pc.bold(pc.cyan(f)) + " " + pc.dim("(" + pc.yellow(String(count)) + ")"));
        if (opts.showLines) {
          for (const h of hits.slice(0, 5)) {
            console.log("    " + pc.dim("L" + String(h.line) + ":") + " " + pc.dim(h.text));
          }
          if (hits.length > 5) {
            console.log(pc.dim("    ... +" + String(hits.length - 5) + " more"));
          }
        }
        shown++;
      }

      if (byFile.size > cap) {
        console.log(pc.dim("\n  ... +" + String(byFile.size - cap) + " more files omitted (use --max to increase)"));
      }

      // Impact panel
      console.log();
      console.log(pc.bold(pc.green("  Impact")) + pc.dim(" — quick risk estimate"));
      console.log(pc.dim("  ─".repeat(40)));
      console.log("  " + pc.bold("Importance:") + " " + pc.bold(pc.yellow(String(importance))));
      console.log("  " + pc.bold("Importer files:") + " " + pc.cyan(String(byFile.size)));
      console.log("  " + pc.bold("Total refs:") + " " + pc.cyan(String(totalRefs)));

      // Git origin panel
      console.log();
      console.log(pc.bold(pc.magenta("  Git origin")) + pc.dim(" — where this file came from"));
      console.log(pc.dim("  ─".repeat(40)));
      if (git) {
        const author = git.author ? `${git.author.name}${git.author.email ? ` <${git.author.email}>` : ""}` : null;
        console.log("  " + pc.bold("First seen:") + " " + pc.cyan(git.commit) + " " + pc.dim("(" + git.date + ")") + " " + pc.dim(git.subject));
        if (author) console.log("  " + pc.bold("Introduced by:") + " " + pc.cyan(author));
      } else {
        console.log(pc.dim("  - Git origin not found or repository unavailable."));
      }

      // Transitive panel
      if (transitiveMap) {
        console.log();
        console.log(pc.bold(pc.yellow("  Transitive importers")) + pc.dim(" — upstream dependents by distance"));
        console.log(pc.dim("  ─".repeat(40)));
        if (transitiveMap.size === 0) {
          console.log(pc.dim("  (no transitive importers found)"));
        } else {
          for (const [depth, set] of Array.from(transitiveMap.entries()).sort((a, b) => a[0] - b[0])) {
            console.log("  " + pc.dim("depth " + String(depth) + ":") + " " + Array.from(set).slice(0, 10).map((s) => pc.cyan(s)).join(pc.dim(', ')));
          }
        }
      }

      process.exit(0);
    } catch (err: any) {
      console.error(pc.red("Unexpected error:"), err?.message ?? String(err));
      process.exit(2);
    }
  });

program.parse(process.argv);
