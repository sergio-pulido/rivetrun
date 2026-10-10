// docs/inputs/component-models.json: one entry per modelled component. The UI reads two things from it, the BOM key
// and whether the render is marked approximate. Nothing else in the file (paths, author) reaches the page.

/** Shown under a render the manifest marks `"approximate": true`: the maker publishes no dimensions to model from. */
export const APPROXIMATE_CAPTION = 'Illustrative render, dimensions not published';

/** BOM keys whose render is marked approximate. Only a literal `true` counts; unreadable entries are skipped. */
export function approximateKeys(manifest: unknown): readonly string[] {
  if (!Array.isArray(manifest)) return [];
  return manifest.flatMap((entry: unknown): string[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { key, approximate } = entry as { readonly key?: unknown; readonly approximate?: unknown };
    return typeof key === 'string' && key.length > 0 && approximate === true ? [key] : [];
  });
}
