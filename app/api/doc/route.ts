import { auth } from "@clerk/nextjs/server";
import { SupabaseStorage } from "@/src/lib/storage/SupabaseStorage";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const url = new URL(request.url);
  const rel = url.searchParams.get("path");
  const ns = url.searchParams.get("ns") ?? "public";
  if (!rel) return new Response("missing path", { status: 400 });
  if (!rel.endsWith(".md")) return new Response("invalid path", { status: 400 });

  const body = await request.text();

  const { userId } = await auth();
  if (!userId || userId !== ns) {
    return new Response("unauthorized", { status: 403 });
  }

  try {
    await new SupabaseStorage().write(`${ns}/${rel}`, body);
    return new Response(null, { status: 204 });
  } catch (err) {
    return new Response(`save failed: ${(err as Error).message}`, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const rel = url.searchParams.get("path");
  const ns = url.searchParams.get("ns") ?? "public";
  if (!rel) return new Response("missing path", { status: 400 });
  if (!rel.endsWith(".md")) return new Response("invalid path", { status: 400 });

  const { userId } = await auth();
  if (!userId || userId !== ns) return new Response("unauthorized", { status: 403 });

  try {
    await new SupabaseStorage().delete(`${ns}/${rel}`);
    return new Response(null, { status: 204 });
  } catch (err) {
    return new Response(`delete failed: ${(err as Error).message}`, { status: 500 });
  }
}
