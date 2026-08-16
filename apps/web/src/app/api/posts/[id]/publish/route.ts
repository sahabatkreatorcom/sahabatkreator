import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { publishPost } from "@/lib/publishing/publish-post";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/posts/[id]/publish — publish post sekarang (manual).
 */
export const POST = withAuth(async (ctx, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { id } = await params;
    const result = await publishPost(activeOrganizationId, id);

    if (!result.ok) {
        return json({ error: result.error }, { status: result.error === "Post tidak ditemukan." ? 404 : 502 });
    }

    return json({ success: true, postId: result.postId, postUrl: result.postUrl });
});