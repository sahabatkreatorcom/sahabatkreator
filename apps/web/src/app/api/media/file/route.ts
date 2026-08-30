import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { downloadFile } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = withAuth(async (ctx, req: NextRequest) => {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    if (!key) return json({ error: "key wajib." }, { status: 400 });

    try {
        const file = await downloadFile(key);
        if (!file.body) return json({ error: "File tidak ditemukan." }, { status: 404 });

        const headers = new Headers();
        if (file.contentType) headers.set("Content-Type", file.contentType);
        if (file.contentLength) headers.set("Content-Length", String(file.contentLength));
        headers.set("Cache-Control", "public, max-age=31536000, immutable");

        return new Response(file.body, { status: 200, headers });
    } catch {
        return json({ error: "Gagal memuat file." }, { status: 500 });
    }
});
