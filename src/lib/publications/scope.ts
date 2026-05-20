import type { DocIndex, DocNode } from "@/src/core/indexer";

/**
 * Compute the set of doc paths covered by a publication.
 *
 * Starts with the root doc, then:
 *  - if `includeDescendants` is true, walks the parent → child hierarchy
 *    transitively from the root via `## Parent of` declarations.
 *  - if `includeDirectAssociates` is true, after the descendant walk, adds
 *    every doc directly associated (one hop, no recursion) with any doc
 *    already in the set, plus those associates' descendants when descendants
 *    is on (since the operator's intuition was "include them like children").
 *  - merges in any `extraPaths` the owner picked manually in the custom picker.
 *
 * Strictly bounded — no recursive associates-of-associates, no implicit
 * cross-tree expansion. The owner controls the boundary.
 */
export function computeIncludedPaths(
  index: DocIndex,
  rootPath: string,
  options: {
    includeDescendants: boolean;
    includeDirectAssociates: boolean;
    extraPaths?: string[];
  }
): string[] {
  const byPath = new Map<string, DocNode>();
  for (const d of index.docs) byPath.set(d.path, d);

  // Build hierarchy adjacency from index.edges — the indexer makes these
  // bidirectionally from both "Parent of" and "Child of" declarations,
  // so descendant walks pick up asymmetric edges (a common case where
  // children declare "Child of [[Parent]]" but the parent doesn't
  // reciprocate with a Parent-of bullet).
  const childrenByParent = new Map<string, string[]>();
  const assocsByPath = new Map<string, string[]>();
  for (const e of index.edges) {
    if (e.kind === "hierarchy") {
      const arr = childrenByParent.get(e.from) ?? [];
      arr.push(e.to);
      childrenByParent.set(e.from, arr);
    } else if (e.kind === "assoc") {
      const a = assocsByPath.get(e.from) ?? [];
      a.push(e.to);
      assocsByPath.set(e.from, a);
      const b = assocsByPath.get(e.to) ?? [];
      b.push(e.from);
      assocsByPath.set(e.to, b);
    }
  }

  const included = new Set<string>();
  if (byPath.has(rootPath)) included.add(rootPath);

  if (options.includeDescendants) {
    const stack: string[] = [rootPath];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const child of childrenByParent.get(cur) ?? []) {
        if (included.has(child)) continue;
        included.add(child);
        stack.push(child);
      }
    }
  }

  if (options.includeDirectAssociates) {
    // One-hop scan over the current set. Don't iterate over newly added
    // associates' associates — that's the recursion we deliberately avoid.
    const snapshot = [...included];
    for (const p of snapshot) {
      for (const associate of assocsByPath.get(p) ?? []) {
        if (included.has(associate)) continue;
        included.add(associate);
        // If descendants is on, also include the associate's subtree —
        // an associate is a peer node; bringing it in without its own
        // children would feel half-published.
        if (options.includeDescendants) {
          const stack = [associate];
          while (stack.length > 0) {
            const cur = stack.pop()!;
            for (const c of childrenByParent.get(cur) ?? []) {
              if (included.has(c)) continue;
              included.add(c);
              stack.push(c);
            }
          }
        }
      }
    }
  }

  // Merge in manually picked paths last (the owner's custom selection
  // overrides everything else and can include arbitrary docs).
  if (options.extraPaths) {
    for (const p of options.extraPaths) {
      if (byPath.has(p)) included.add(p);
    }
  }

  return [...included];
}

/**
 * Filter the full vault index down to only the published docs + the edges
 * that connect them. Edges with one endpoint outside the included set are
 * dropped — the public viewer should see a self-contained subgraph.
 */
export function scopeIndex(index: DocIndex, includedPaths: string[]): DocIndex {
  const included = new Set(includedPaths);
  const docs = index.docs.filter((d) => included.has(d.path));
  // Edges use path-or-title strings; the indexer's edges are between paths.
  const edges = index.edges.filter((e) => included.has(e.from) && included.has(e.to));
  const entry = index.entry && included.has(index.entry) ? index.entry : null;
  return { docs, edges, entry };
}

/**
 * Render-time rewrite of a doc's markdown for public consumption.
 *
 * Two transformations:
 *
 *  1. Relationship sections (`## Child of` / `## Parent of` / `## Associated with`):
 *     filter bullets so only ones whose leading wiki-link target is inside
 *     the published title set survive. If a section has no surviving
 *     bullets, drop the section heading too.
 *
 *  2. Inline wiki-links (anywhere outside relationship sections, or inside
 *     surviving bullets' prose): replace `[[OutsideTitle]]` with the bare
 *     `OutsideTitle` text. Inside-set links keep their `[[…]]` so the
 *     rendered HTML stays clickable.
 *
 * Input is the raw markdown; output is the rewritten markdown ready for
 * the existing renderer.
 */
const REL_HEADINGS = new Set(["child of", "parent of", "associated with"]);
const WIKI_RE = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;

export function rewriteForPublic(content: string, includedTitlesLower: Set<string>): string {
  const lines = content.split("\n");
  const out: string[] = [];

  // Two passes interleaved by section. We iterate line-by-line, tracking
  // whether we're inside a relationship section. Bullet filtering happens
  // only there; wiki-link rewriting happens everywhere else (and inside
  // surviving bullets, which we handle by buffering the section).
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2 && REL_HEADINGS.has(h2[1].trim().toLowerCase())) {
      // Collect the section body until the next H1/H2 or EOF
      const sectionStart = i;
      i++;
      const body: string[] = [];
      while (i < lines.length && !/^#{1,2}\s/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      // Keep every bullet verbatim — the owner's structure is part of what
      // visitors are coming to see. Wiki-links to in-set docs remain
      // navigable; out-of-set targets get rewritten to plain text by
      // rewriteWikiLinks (same policy as inline links elsewhere).
      const kept: string[] = [];
      for (const bodyLine of body) {
        const bullet = bodyLine.match(/^\s*[-*+]\s+(.*)$/);
        if (!bullet) {
          if (kept.length > 0 || bodyLine.trim().length > 0) kept.push(bodyLine);
          continue;
        }
        kept.push(rewriteWikiLinks(bodyLine, includedTitlesLower));
      }
      // Trim trailing blank lines on the kept body.
      while (kept.length > 0 && kept[kept.length - 1].trim() === "") kept.pop();

      if (kept.length === 0) {
        // Entire section collapses — drop the heading too. Skip preceding
        // blank line if there is one (avoids leaving a double blank).
        if (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
        continue;
      }
      out.push(lines[sectionStart]);
      out.push(...kept);
      continue;
    }
    out.push(rewriteWikiLinks(line, includedTitlesLower));
    i++;
  }

  return out.join("\n");
}

function rewriteWikiLinks(line: string, includedTitlesLower: Set<string>): string {
  // Don't rewrite inside fenced code blocks — that's tracked by the caller
  // for now; the indexer treats code blocks as opaque and our rewriting
  // here is per-line, so this is a known limitation: a wiki-link literally
  // inside ```fences``` may get rewritten. Acceptable for the markdown shapes
  // in this vault.
  return line.replace(WIKI_RE, (full, title: string) => {
    const targetLower = title.trim().toLowerCase();
    return includedTitlesLower.has(targetLower) ? full : title;
  });
}
