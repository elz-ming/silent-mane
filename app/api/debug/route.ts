import { adminClient } from "@/src/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const docsDir = process.env.EMDEE_DOCS;

  let storageTest: { ok: boolean; count?: number; files?: string[]; error?: string } | null = null;
  if (supabaseUrl && (secretKey || serviceKey)) {
    try {
      const { data, error } = await adminClient().storage.from("vaults").list("public", { limit: 5 });
      storageTest = {
        ok: !error,
        count: data?.length ?? 0,
        files: data?.map((f) => f.name) ?? [],
        error: error?.message,
      };
    } catch (err) {
      storageTest = { ok: false, error: (err as Error).message };
    }
  }

  return Response.json({
    docsDir: docsDir ?? null,
    supabaseUrl: supabaseUrl ? supabaseUrl.replace("https://", "").slice(0, 30) : null,
    hasSecretKey: !!secretKey,
    hasServiceKey: !!serviceKey,
    storageTest,
  });
}
