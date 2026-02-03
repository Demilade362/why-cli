export function computeImpact(importerFiles, totalRefs) {
    if (importerFiles >= 10 || totalRefs >= 25)
        return "HIGH";
    if (importerFiles >= 3 || totalRefs >= 8)
        return "MEDIUM";
    return "LOW";
}
