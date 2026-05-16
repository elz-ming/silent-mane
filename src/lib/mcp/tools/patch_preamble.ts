import { createHash } from "node:crypto";
import { validatePath, readVaultFile, writeVaultFile } from "./vault";
import type { ToolContext } from "./types";

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

const FENCE_RE = /^\s*(?:```|~~~)/;
const H1_RE = /^#\s+(.+?)\s*$/;
const H2_RE = /^##\s+(.+?)\s*$/;

interface PreambleLoc {
  h1LineIdx: number;
  bodyStartLineIdx: number;
  bodyEndLineIdx: number;
}

/**
 * Find the preamble region: the lines between the H1 and the first H2.
 * Returns null if the doc has no H1.
 *
 * The blockquote summary lives inside this region, so callers patching the
 * preamble are also replacing the summary — that's the point. Most docs only
 * have a blockquote + a few intro paragraphs here; load-bearing wiki-links
 * occasionally land in those paragraphs (see SPRINT-012's INSTRUCTIONS.md /
 * VAULT.md straggler), which `patch_section` can't reach.
 */
function findPreamble(content: string): PreambleLoc | null {
  const lines = content.split("\n");
  let inFence = false;
  let h1Idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (H1_RE.test(lines[i])) { h1Idx = i; break; }
  }
  if (h1Idx === -1) return null;

  let firstH2Idx = lines.length;
  inFence = false;
  for (let i = h1Idx + 1; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (H2_RE.test(lines[i])) { firstH2Idx = i; break; }
  }
  return { h1LineIdx: h1Idx, bodyStartLineIdx: h1Idx + 1, bodyEndLineIdx: firstH2Idx };
}

export function extractPreamble(content: string): { body: string; content_hash: string } | null {
  const loc = findPreamble(content);
  if (!loc) return null;
  const body = content
    .split("\n")
    .slice(loc.bodyStartLineIdx, loc.bodyEndLineIdx)
    .join("\n")
    .replace(/^\s*\n+/, "")
    .replace(/\n+\s*$/, "");
  return { body, content_hash: hashBody(body) };
}

function hashBody(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex").slice(0, 16);
}

/**
 * Replace everything between the H1 and the first H2 (the "preamble" region:
 * blockquote summary + any intro paragraphs). Version-guarded with
 * `expected_content_hash` from a recent `get_doc` call.
 *
 * The body argument is the FULL new preamble — typically a blockquote line
 * plus one or two paragraphs. The H1 itself is not touched. To rename the
 * doc's title, use `rename_doc`.
 */
export async function patchPreamble(ctx: ToolContext, args: Record<string, unknown>): Promise<unknown> {
  const rel = String(args.path);
  validatePath(rel);
  const body = String(args.body ?? "");
  const expected = String(args.expected_content_hash ?? "");
  if (!expected) throw new Error("expected_content_hash required");

  const content = await readVaultFile(ctx, rel);
  if (content === null) return json({ error: "doc_not_found", path: rel });

  const loc = findPreamble(content);
  if (!loc) return json({ error: "no_h1", message: "Doc has no H1 so there is no preamble region to patch." });

  const lines = content.split("\n");
  const currentBody = lines
    .slice(loc.bodyStartLineIdx, loc.bodyEndLineIdx)
    .join("\n")
    .replace(/^\s*\n+/, "")
    .replace(/\n+\s*$/, "");
  const currentHash = hashBody(currentBody);
  if (currentHash !== expected) {
    return json({
      error: "version_conflict",
      expected_content_hash: expected,
      actual_content_hash: currentHash,
      message: "Preamble was modified since you last read it. Call get_doc again and reconcile.",
    });
  }

  const newContent = [
    ...lines.slice(0, loc.bodyStartLineIdx),
    "",
    ...body.split("\n"),
    "",
    ...lines.slice(loc.bodyEndLineIdx),
  ].join("\n");
  await writeVaultFile(ctx, rel, newContent);
  return json({ ok: true, content_hash: hashBody(body.trim()) });
}
