import { buildIndexFromContents } from "@/src/core/indexer";
import { SupabaseStorage } from "@/src/lib/storage/SupabaseStorage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ns = url.searchParams.get("ns") ?? "public";

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return Response.json({ docs: [], edges: [], entry: null }, { headers: { "Cache-Control": "no-store" } });
  }

  const storage = new SupabaseStorage();
  const prefix = `${ns}/`;
  let listed: Awaited<ReturnType<typeof storage.list>>;
  try {
    listed = await storage.list(prefix);
  } catch {
    listed = [];
  }

  if (listed.length === 0) {
    return Response.json({ docs: [], edges: [], entry: null }, { headers: { "Cache-Control": "no-store" } });
  }

  const files = await Promise.all(
    listed.map(async (f) => ({
      path: f.path.slice(prefix.length),
      content: (await storage.read(f.path)) ?? "",
    }))
  );

  const index = buildIndexFromContents(files);
  return Response.json(index, { headers: { "Cache-Control": "no-store" } });
}
