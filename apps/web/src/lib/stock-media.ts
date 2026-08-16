import { env } from "@sahabat-kreator/env/server";

export type StockMediaSource = "PIXABAY" | "PEXELS" | "UNSPLASH";

export interface StockMediaResult {
    id: string;
    source: StockMediaSource;
    /** Thumbnail kecil untuk grid */
    thumbUrl: string;
    /** URL ukuran sedang */
    previewUrl: string;
    /** URL ukuran penuh untuk di-download */
    fullUrl: string;
    width: number;
    height: number;
    author: string;
    description: string;
    pageUrl: string;
    /** Tersedia hanya untuk source yang mendukung video */
    videoUrl?: string;
    mimeType: string;
}

export interface StockMediaSearchParams {
    query: string;
    perPage?: number;
    page?: number;
}

export interface StockMediaSearchResponse {
    results: StockMediaResult[];
    total: number;
    page: number;
    perPage: number;
    hasMore: boolean;
}

const PER_PAGE_MAX = 80;

/**
 * Cek provider mana yang terkonfigurasi. Return false kalau API key kosong.
 */
export function isStockMediaConfigured(source: StockMediaSource): boolean {
    switch (source) {
        case "PIXABAY":
            return Boolean(env.PIXABAY_API_KEY);
        case "PEXELS":
            return Boolean(env.PEXELS_API_KEY);
        case "UNSPLASH":
            return Boolean(env.UNSPLASH_API_KEY);
    }
}

// ─── Pixabay ────────────────────────────────────────────────────────────────

interface PixabayImageHit {
    id: number;
    type: "photo" | "illustration" | "vector";
    webformatURL: string;
    largeImageURL: string;
    previewURL: string;
    imageWidth: number;
    imageHeight: number;
    user: string;
    tags: string;
    pageURL: string;
}

interface PixabayVideoHit {
    id: number;
    type: "film";
    picture_id: string;
    user: string;
    tags: string;
    pageURL: string;
    videos: {
        large: { url: string; width: number; height: number };
        medium: { url: string; width: number; height: number };
        small: { url: string; width: number; height: number };
        tiny: { url: string; width: number; height: number };
    };
}

interface PixabayResponse {
    total: number;
    totalHits: number;
    hits: (PixabayImageHit | PixabayVideoHit)[];
}

async function searchPixabay(params: StockMediaSearchParams): Promise<StockMediaSearchResponse> {
    const url = new URL("https://pixabay.com/api/");
    url.searchParams.set("key", env.PIXABAY_API_KEY!);
    url.searchParams.set("q", params.query);
    url.searchParams.set("image_type", "photo");
    url.searchParams.set("per_page", String(Math.min(params.perPage ?? 20, PER_PAGE_MAX)));
    url.searchParams.set("page", String(params.page ?? 1));

    const res = await fetch(url.toString(), { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`Pixabay API error ${res.status}`);

    const data = (await res.json()) as PixabayResponse;
    const results: StockMediaResult[] = data.hits.map((hit) => {
        if ("videos" in hit && hit.type === "film") {
            const v = hit.videos.medium;
            return {
                id: String(hit.id),
                source: "PIXABAY",
                thumbUrl: `https://i.vimeocdn.com/video/${hit.picture_id}_200x150.jpg`,
                previewUrl: v.url,
                fullUrl: hit.videos.large.url,
                width: v.width,
                height: v.height,
                author: hit.user,
                description: hit.tags,
                pageUrl: hit.pageURL,
                videoUrl: hit.videos.large.url,
                mimeType: "video/mp4",
            } as StockMediaResult;
        }
        const img = hit as PixabayImageHit;
        return {
            id: String(img.id),
            source: "PIXABAY",
            thumbUrl: img.webformatURL,
            previewUrl: img.webformatURL,
            fullUrl: img.largeImageURL,
            width: img.imageWidth,
            height: img.imageHeight,
            author: img.user,
            description: img.tags,
            pageUrl: img.pageURL,
            mimeType: "image/jpeg",
        } as StockMediaResult;
    });

    return {
        results,
        total: data.totalHits,
        page: params.page ?? 1,
        perPage: params.perPage ?? 20,
        hasMore: (params.page ?? 1) * (params.perPage ?? 20) < data.totalHits,
    };
}

// ─── Pexels ──────────────────────────────────────────────────────────────────

interface PexelsPhoto {
    id: number;
    width: number;
    height: number;
    url: string;
    photographer: string;
    alt: string | null;
    src: {
        original: string;
        large2x: string;
        large: string;
        medium: string;
        small: string;
        tiny: string;
    };
}

interface PexelsResponse {
    total_results: number;
    page: number;
    per_page: number;
    photos: PexelsPhoto[];
}

async function searchPexels(params: StockMediaSearchParams): Promise<StockMediaSearchResponse> {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", params.query);
    url.searchParams.set("per_page", String(Math.min(params.perPage ?? 20, PER_PAGE_MAX)));
    url.searchParams.set("page", String(params.page ?? 1));

    const res = await fetch(url.toString(), {
        headers: { Authorization: env.PEXELS_API_KEY! },
        next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`Pexels API error ${res.status}`);

    const data = (await res.json()) as PexelsResponse;
    const results: StockMediaResult[] = data.photos.map((p) => ({
        id: String(p.id),
        source: "PEXELS",
        thumbUrl: p.src.small,
        previewUrl: p.src.medium,
        fullUrl: p.src.large2x,
        width: p.width,
        height: p.height,
        author: p.photographer,
        description: p.alt ?? p.photographer,
        pageUrl: p.url,
        mimeType: "image/jpeg",
    }));

    return {
        results,
        total: data.total_results,
        page: data.page,
        perPage: data.per_page,
        hasMore: data.page * data.per_page < data.total_results,
    };
}

// ─── Unsplash ────────────────────────────────────────────────────────────────

interface UnsplashPhoto {
    id: string;
    width: number;
    height: number;
    alt_description: string | null;
    description: string | null;
    urls: {
        raw: string;
        full: string;
        regular: string;
        small: string;
        thumb: string;
    };
    user: { name: string };
    links: { html: string };
}

interface UnsplashResponse {
    total: number;
    total_pages: number;
    results: UnsplashPhoto[];
}

async function searchUnsplash(params: StockMediaSearchParams): Promise<StockMediaSearchResponse> {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", params.query);
    url.searchParams.set("per_page", String(Math.min(params.perPage ?? 20, PER_PAGE_MAX)));
    url.searchParams.set("page", String(params.page ?? 1));

    const res = await fetch(url.toString(), {
        headers: { Authorization: `Client-ID ${env.UNSPLASH_API_KEY!}` },
        next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`Unsplash API error ${res.status}`);

    const data = (await res.json()) as UnsplashResponse;
    const results: StockMediaResult[] = data.results.map((p) => ({
        id: p.id,
        source: "UNSPLASH",
        thumbUrl: p.urls.small,
        previewUrl: p.urls.regular,
        fullUrl: p.urls.full,
        width: p.width,
        height: p.height,
        author: p.user.name,
        description: p.alt_description ?? p.description ?? "Unsplash photo",
        pageUrl: p.links.html,
        mimeType: "image/jpeg",
    }));

    return {
        results,
        total: data.total,
        page: params.page ?? 1,
        perPage: params.perPage ?? 20,
        hasMore: (params.page ?? 1) < data.total_pages,
    };
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

const SEARCHERS: Record<StockMediaSource, (p: StockMediaSearchParams) => Promise<StockMediaSearchResponse>> = {
    PIXABAY: searchPixabay,
    PEXELS: searchPexels,
    UNSPLASH: searchUnsplash,
};

export async function searchStockMedia(
    source: StockMediaSource,
    params: StockMediaSearchParams,
): Promise<StockMediaSearchResponse> {
    if (!isStockMediaConfigured(source)) {
        throw new Error(`${source} API key not configured`);
    }
    return SEARCHERS[source](params);
}