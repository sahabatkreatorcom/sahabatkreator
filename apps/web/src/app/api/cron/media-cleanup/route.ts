import { NextRequest } from "next/server";
import { json, verifyCronSecret } from "@/lib/api";
import { cleanupMediaStorage } from "@/lib/media-cleanup";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/cron/media-cleanup — bersihkan storage R2 otomatis.
 *
 * 1. Orphan media (`orgs/{org}/media/...`, `orgs/{org}/media-transcoded/...`) tanpa record DB.
 * 2. Orphan video frames (`orgs/{org}/media-frames/{mediaId}/...`) yang mediaId-nya sudah dihapus.
 * 3. Temp TikTok JPEG (`tiktok-jpeg/...`) lebih tua dari 7 hari.
 *
 * Query: ?dryRun=true untuk preview tanpa menghapus.
 * Dipanggil cron eksternal (Bearer CRON_SECRET) atau via BullMQ scheduled job.
 */
export const POST = async (req: NextRequest) => {
    if (!verifyCronSecret(req)) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";
    const result = await cleanupMediaStorage({ dryRun });
    return json(result);
};
