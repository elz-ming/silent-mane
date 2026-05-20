import type { DocIndex, DocNode } from "./indexer";

/**
 * Resolve a wiki-link target to a doc in the given index. Tries the H1
 * title first (case-insensitive); falls back to the filename slug (last
 * path segment without ".md"). The filename fallback handles vaults
 * where wiki-links use the SCREAMING-KEBAB form while H1s carry a
 * human-friendly title.
 */
export function resolveWikiLink(index: DocIndex, target: string): DocNode | null {
  const t = target.trim().toLowerCase();
  if (!t) return null;
  for (const d of index.docs) {
    if (d.title.toLowerCase() === t) return d;
  }
  for (const d of index.docs) {
    const slug = filenameSlug(d.path);
    if (slug.toLowerCase() === t) return d;
  }
  return null;
}

/** Last path segment with ".md" stripped. "events/foo/BAR.md" → "BAR". */
export function filenameSlug(path: string): string {
  const last = path.split("/").pop() ?? path;
  return last.replace(/\.md$/i, "");
}

/**
 * Build a set of lowercase keys (H1 titles + filename slugs) that
 * resolve to in-set docs. Used by rewriteForPublic to decide whether a
 * wiki-link should remain navigable or be flattened to plain text.
 */
export function resolvableKeysLower(docs: DocNode[]): Set<string> {
  const out = new Set<string>();
  for (const d of docs) {
    out.add(d.title.toLowerCase());
    out.add(filenameSlug(d.path).toLowerCase());
  }
  return out;
}
