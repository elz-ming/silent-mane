import { put } from "@vercel/blob";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

async function walk(dir: string, base: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full, base)));
    else if (e.isFile() && e.name.endsWith(".md")) out.push(path.relative(base, full));
  }
  return out;
}

// POST /api/sync — uploads all local docs to Vercel Blob.
// Only works when EMDEE_DOCS and BLOB_READ_WRITE_TOKEN are both set.
export async function POST() {
  const docsDir = process.env.EMDEE_DOCS;
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (!docsDir) return Response.json({ error: "EMDEE_DOCS not set" }, { status: 400 });
  if (!token) return Response.json({ error: "BLOB_READ_WRITE_TOKEN not set" }, { status: 400 });

  const resolved = path.resolve(docsDir);
  try { await stat(resolved); } catch {
    return Response.json({ error: "docs directory not found" }, { status: 400 });
  }

  const files = await walk(resolved, resolved);

  await Promise.all(
    files.map(async (rel) => {
      const content = await readFile(path.join(resolved, rel), "utf8");
      await put(rel, content, { access: "public", addRandomSuffix: false, token });
    })
  );

  return Response.json({ synced: files.length, files });
}

// GET /api/sync — returns whether sync is available
export async function GET() {
  const canSync = !!(process.env.EMDEE_DOCS && process.env.BLOB_READ_WRITE_TOKEN);
  return Response.json({ canSync });
}
