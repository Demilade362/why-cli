export function looksLikeReference(line: string, spec: string) {
  // Escape special regex chars in spec
  const escaped = spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const q = `['\"\`]${escaped}['\"\`]`;

  const re = new RegExp(
    String.raw`(\bfrom\s*${q}|\bimport\s*\(\s*${q}\s*\)|\brequire\s*\(\s*${q}\s*\)|\bexport\s+.*\sfrom\s*${q})`
  );

  return re.test(line);
}
