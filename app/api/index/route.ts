import { buildIndex } from "@/src/core/indexer";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const docsDir = process.env.SILENT_MANE_DOCS;
  if (!docsDir) {
    return Response.json({ error: "SILENT_MANE_DOCS not set" }, { status: 500 });
  }
  const index = await buildIndex(path.resolve(docsDir));
  return Response.json(index, {
    headers: { "Cache-Control": "no-store" },
  });
}
