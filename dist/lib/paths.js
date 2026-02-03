import path from "node:path";
export function normalizeToPosix(p) {
    return p.split(path.sep).join("/");
}
export function stripExt(p) {
    return p.replace(/\.[a-zA-Z0-9]+$/, "");
}
export function resolveTargetVariants(cwd, inputFile) {
    const abs = path.isAbsolute(inputFile) ? inputFile : path.resolve(cwd, inputFile);
    const rel = normalizeToPosix(path.relative(cwd, abs));
    const relNoExt = stripExt(rel);
    const variants = new Set();
    const add = (s) => {
        if (!s)
            return;
        variants.add(s);
        if (!s.startsWith("./") && !s.startsWith("../") && !s.startsWith("/")) {
            variants.add("./" + s);
        }
    };
    add(rel);
    add(relNoExt);
    const inputNorm = normalizeToPosix(inputFile);
    add(inputNorm);
    add(stripExt(inputNorm));
    return { abs, rel, variants: Array.from(variants) };
}
