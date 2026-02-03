import { spawnSync } from "node:child_process";
import { GitOrigin } from "../types.js";

export async function getGitOrigin(cwd: string, absPath: string, relPath: string): Promise<GitOrigin> {
  try {
    // Use spawnSync to avoid shell interpretation of '|' in format
    const a = spawnSync(
      "git",
      ["log", "--diff-filter=A", "--follow", "--format=%H|%ci|%s", "-1", "--", relPath],
      { cwd, encoding: "utf8" }
    );
    const out = String(a.stdout || "").trim();
    if (out) {
      const parts = out.split("|");
      const hash = parts[0];
      const dateRaw = parts[1] ?? "";
      const subject = parts.slice(2).join("|");
      const date = dateRaw.split(" ")[0] ?? dateRaw;
      return { commit: hash.slice(0, 7), date, subject };
    }
  } catch (e) {
    // fallthrough
  }

  // Fallback: earliest entry from git log --follow
  try {
    const b = spawnSync(
      "git",
      ["log", "--follow", "--format=%H|%ci|%s", "--", relPath],
      { cwd, encoding: "utf8" }
    );
    const out = String(b.stdout || "").trim();
    if (out) {
      const lines = out.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1];
      if (last) {
        const parts = last.split("|");
        const hash = parts[0];
        const dateRaw = parts[1] ?? "";
        const subject = parts.slice(2).join("|");
        const date = dateRaw.split(" ")[0] ?? dateRaw;
        return { commit: hash.slice(0, 7), date, subject };
      }
    }
  } catch (e) {
    // ignore
  }

  return null;
}
