"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DocIndex } from "@/src/core/indexer";

interface TreeNode {
  path: string;
  title: string;
  children: TreeNode[];
}

interface Props {
  index: DocIndex;
  focalPath: string;
  selectedPaths: Set<string>;
  onChange: (next: Set<string>) => void;
}

/**
 * Build a focal-rooted descendant tree from the index's hierarchy edges
 * (which are symmetric — they pick up both "Parent of" and "Child of"
 * declarations). Cycles are broken by a visited set; siblings sort by
 * title for predictable ordering.
 */
function buildFocalTree(index: DocIndex, focalPath: string): {
  tree: TreeNode | null;
  descendants: string[];
  associates: { path: string; title: string }[];
} {
  const byPath = new Map<string, { title: string }>();
  for (const d of index.docs) byPath.set(d.path, { title: d.title });

  const childrenByParent = new Map<string, string[]>();
  const assocsByPath = new Map<string, Set<string>>();
  for (const e of index.edges) {
    if (e.kind === "hierarchy") {
      const arr = childrenByParent.get(e.from) ?? [];
      arr.push(e.to);
      childrenByParent.set(e.from, arr);
    } else if (e.kind === "assoc") {
      const a = assocsByPath.get(e.from) ?? new Set();
      a.add(e.to);
      assocsByPath.set(e.from, a);
      const b = assocsByPath.get(e.to) ?? new Set();
      b.add(e.from);
      assocsByPath.set(e.to, b);
    }
  }

  const focal = byPath.get(focalPath);
  if (!focal) return { tree: null, descendants: [], associates: [] };

  const descendantSet = new Set<string>([focalPath]);
  const walk = (path: string): TreeNode => {
    const doc = byPath.get(path);
    const childPaths = (childrenByParent.get(path) ?? []).slice().sort((a, b) => {
      const ta = byPath.get(a)?.title ?? a;
      const tb = byPath.get(b)?.title ?? b;
      return ta.localeCompare(tb);
    });
    const children: TreeNode[] = [];
    for (const c of childPaths) {
      if (descendantSet.has(c)) continue;
      descendantSet.add(c);
      children.push(walk(c));
    }
    return { path, title: doc?.title ?? path, children };
  };
  const tree = walk(focalPath);

  // Direct associates = any assoc of any descendant that isn't itself
  // a descendant. Sorted by title, deduped.
  const assocPaths = new Set<string>();
  for (const d of descendantSet) {
    for (const a of assocsByPath.get(d) ?? []) {
      if (!descendantSet.has(a)) assocPaths.add(a);
    }
  }
  const associates = [...assocPaths]
    .map((p) => ({ path: p, title: byPath.get(p)?.title ?? p }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return { tree, descendants: [...descendantSet], associates };
}

function gatherDescendantPaths(node: TreeNode): string[] {
  const out: string[] = [node.path];
  for (const c of node.children) out.push(...gatherDescendantPaths(c));
  return out;
}

interface TreeRowProps {
  node: TreeNode;
  selected: Set<string>;
  isFocal: boolean;
  collapsed: Set<string>;
  onToggleSelect: (paths: string[], checked: boolean) => void;
  onToggleCollapsed: (path: string) => void;
}

function TreeRow({ node, selected, isFocal, collapsed, onToggleSelect, onToggleCollapsed }: TreeRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const allPaths = useMemo(() => gatherDescendantPaths(node), [node]);
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.path);

  const selfChecked = selected.has(node.path);
  const subSelected = allPaths.filter((p) => selected.has(p)).length;
  const indeterminate = !isFocal && subSelected > 0 && subSelected < allPaths.length;
  const fullyChecked = subSelected === allPaths.length;

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const onCheckboxChange = () => {
    if (isFocal) return; // root is locked on
    const next = !fullyChecked; // if fully checked, uncheck all; otherwise check all
    onToggleSelect(allPaths, next);
  };

  return (
    <li className="share-tree-item">
      <div className="share-tree-row">
        {hasChildren ? (
          <button
            type="button"
            className="share-tree-chevron"
            onClick={() => onToggleCollapsed(node.path)}
            aria-label={isCollapsed ? "Expand" : "Collapse"}
            data-collapsed={isCollapsed}
          >
            ›
          </button>
        ) : (
          <span className="share-tree-chevron-spacer" />
        )}
        <label className="share-tree-label">
          <input
            ref={inputRef}
            type="checkbox"
            checked={selfChecked}
            disabled={isFocal}
            onChange={onCheckboxChange}
          />
          <span className={`share-tree-title ${isFocal ? "is-focal" : ""}`}>
            {node.title}
            {isFocal && <span className="share-tree-focal-tag">(root)</span>}
          </span>
        </label>
      </div>
      {hasChildren && !isCollapsed && (
        <ul className="share-tree-children">
          {node.children.map((c) => (
            <TreeRow
              key={c.path}
              node={c}
              selected={selected}
              isFocal={false}
              collapsed={collapsed}
              onToggleSelect={onToggleSelect}
              onToggleCollapsed={onToggleCollapsed}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ShareTreePicker({ index, focalPath, selectedPaths, onChange }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { tree, descendants, associates } = useMemo(
    () => buildFocalTree(index, focalPath),
    [index, focalPath]
  );

  const totalDescendants = descendants.length;
  const totalAvailable = totalDescendants + associates.length;
  const selectedCount = useMemo(
    () => [...selectedPaths].filter((p) => descendants.includes(p) || associates.some((a) => a.path === p)).length,
    [selectedPaths, descendants, associates]
  );

  const onToggleSelect = (paths: string[], checked: boolean) => {
    const next = new Set(selectedPaths);
    for (const p of paths) {
      if (p === focalPath) continue; // root always in
      if (checked) next.add(p);
      else next.delete(p);
    }
    next.add(focalPath);
    onChange(next);
  };

  const onToggleCollapsed = (path: string) => {
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAll = () => {
    const next = new Set<string>();
    for (const p of descendants) next.add(p);
    for (const a of associates) next.add(a.path);
    onChange(next);
  };

  const descendantsOnly = () => {
    const next = new Set<string>(descendants);
    onChange(next);
  };

  const onToggleAssoc = (path: string, checked: boolean) => {
    const next = new Set(selectedPaths);
    if (checked) next.add(path);
    else next.delete(path);
    onChange(next);
  };

  if (!tree) {
    return <div className="share-tree-empty">Focal doc not found in vault.</div>;
  }

  return (
    <div className="share-tree-picker">
      <div className="share-tree-head">
        <div className="share-tree-head-label">What to share</div>
        <div className="share-tree-head-actions">
          <button type="button" onClick={descendantsOnly}>Descendants only</button>
          <button type="button" onClick={selectAll}>Select all</button>
        </div>
      </div>

      <div className="share-tree-scroll">
        <ul className="share-tree-root">
          <TreeRow
            node={tree}
            selected={selectedPaths}
            isFocal={true}
            collapsed={collapsed}
            onToggleSelect={onToggleSelect}
            onToggleCollapsed={onToggleCollapsed}
          />
        </ul>

        {associates.length > 0 && (
          <div className="share-tree-assoc">
            <div className="share-tree-assoc-head">
              Direct associates (one hop)
              <span className="share-tree-assoc-hint">Off by default — cross-tree connections</span>
            </div>
            <ul className="share-tree-assoc-list">
              {associates.map((a) => (
                <li key={a.path}>
                  <label className="share-tree-label">
                    <input
                      type="checkbox"
                      checked={selectedPaths.has(a.path)}
                      onChange={(e) => onToggleAssoc(a.path, e.target.checked)}
                    />
                    <span className="share-tree-title">{a.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="share-tree-footer">
        <strong>{selectedCount}</strong> of {totalAvailable} doc{totalAvailable === 1 ? "" : "s"} selected
      </div>
    </div>
  );
}
