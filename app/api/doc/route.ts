import { put } from "@vercel/blob";
import path from "node:path";
import { writeFile, mkdir } from "node:fs/promises";

export const dynamic = "force-dynamic";

function safeJoin(base: string, rel: string): string | null {
  const resolved = path.resolve(base, rel);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) return null;
  if (!resolved.endsWith(".md")) return null;
  return resolved;
}

export async function PUT(request: Request) {
  const url = new URL(request.url);
  const rel = url.searchParams.get("path");
  if (!rel) return new Response("missing path", { status: 400 });
  if (!rel.endsWith(".md")) return new Response("invalid path", { status: 400 });

  const body = await request.text();
  const docsDir = process.env.EMDEE_DOCS;

  // Local dev: write to filesystem
  if (docsDir) {
    const resolved = path.resolve(docsDir);
    const file = safeJoin(resolved, rel);
    if (!file) return new Response("invalid path", { status: 400 });
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body, "utf8");
      return new Response(null, { status: 204 });
    } catch (err) {
      return new Response(`save failed: ${(err as Error).message}`, { status: 500 });
    }
  }

  // Cloud: write to Vercel Blob
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return new Response("no storage configured", { status: 500 });

  try {
    await put(rel, body, { access: "public", addRandomSuffix: false, token });
    return new Response(null, { status: 204 });
  } catch (err) {
    return new Response(`save failed: ${(err as Error).message}`, { status: 500 });
  }
}
