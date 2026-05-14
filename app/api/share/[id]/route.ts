import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/src/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Revoke a share or pending invitation. If the row has a share_root the
 * whole cascade group (every row with the same owner/grantee/share_root)
 * is removed atomically — so revoking once unshares the entire subtree.
 * `kind` query param disambiguates between the two tables.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const kind = new URL(request.url).searchParams.get("kind");

  const admin = adminClient();
  if (kind === "invitation") {
    const { data: row } = await admin
      .from("share_invitations")
      .select("invitee_email, share_root")
      .eq("id", id)
      .eq("inviter_id", userId)
      .maybeSingle();
    if (!row) return Response.json({ ok: true });

    let query = admin
      .from("share_invitations")
      .update({ status: "revoked" })
      .eq("inviter_id", userId)
      .ilike("invitee_email", row.invitee_email);
    if (row.share_root) query = query.eq("share_root", row.share_root);
    else query = query.eq("id", id);

    const { error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });
  } else {
    const { data: row } = await admin
      .from("doc_shares")
      .select("grantee_id, share_root")
      .eq("id", id)
      .eq("owner_id", userId)
      .maybeSingle();
    if (!row) return Response.json({ ok: true });

    let query = admin
      .from("doc_shares")
      .delete()
      .eq("owner_id", userId)
      .eq("grantee_id", row.grantee_id);
    if (row.share_root) query = query.eq("share_root", row.share_root);
    else query = query.eq("id", id);

    const { error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
