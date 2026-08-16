import { type NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { searchStockMedia, type StockMediaSource } from "@/lib/stock-media";

export const dynamic = "force-dynamic";

const VALID_SOURCES: StockMediaSource[] = ["PIXABAY", "PEXELS", "UNSPLASH"];

export const GET = withAuth(async (_ctx, req: NextRequest) => {
    const { searchParams } = new URL(req.url);
    const source = (searchParams.get("source") || "").toUpperCase() as StockMediaSource;
    const query = searchParams.get("q")?.trim() || "";
    const perPage = Math.min(Number(searchParams.get("perPage")) || 20, 80);
    const page = Math.max(Number(searchParams.get("page")) || 1, 1);

    if (!VALID_SOURCES.includes(source)) {
        return json({ error: "Invalid source. Must be PIXABAY, PEXELS, or UNSPLASH." }, { status: 400 });
    }

    if (query.length < 2) {
        return json({ error: "Query minimal 2 karakter." }, { status: 400 });
    }

    try {
        const result = await searchStockMedia(source, { query, perPage, page });
        return json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to search stock media";
        return json({ error: message }, { status: 502 });
    }
});