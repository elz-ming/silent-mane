import { buildIndex, buildIndexFromContents } from "@/src/core/indexer";
import { list } from "@vercel/blob";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const docsDir = process.env.EMDEE_DOCS;

  // Local dev: read from filesystem
  if (docsDir) {
    const index = await buildIndex(path.resolve(docsDir));
    return Response.json(index, { headers: { "Cache-Control": "no-store" } });
  }

  // Cloud: read from Vercel Blob
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return Response.json({ docs: [], edges: [], entry: null }, { headers: { "Cache-Control": "no-store" } });
  }

  const { blobs } = await list({ token });
  const mdBlobs = blobs.filter((b) => b.pathname.endsWith(".md"));

  const files = await Promise.all(
    mdBlobs.map(async (b) => ({
      path: b.pathname,
      content: await fetch(b.url).then((r) => r.text()),
    }))
  );

  const index = buildIndexFromContents(files);
  return Response.json(index, { headers: { "Cache-Control": "no-store" } });
}
