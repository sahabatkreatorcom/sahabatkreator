import { YOUTUBE_API_URL } from "@sahabatkreator/publishing";

// Tren pencarian Google Indonesia + tren musik (Apple Music chart) + video
// populer YouTube — semua data riil publik (tanpa data karangan).
//
// Catatan sumber:
// - Google Trends: RSS publik trends.google.com/trending/rss?geo=ID (real).
// - Apple Music: rss.applemarketingtools.com/api/v2/id/music/most-played (real,
//   tanpa API key) — menggantikan daftar "trending sounds" kurasi manual.
// - YouTube: Data API v3 chart=mostPopular regionCode=ID (butuh OAuth akun
//   YouTube org yang terhubung).
//
// Bagian Google Trends:
//
// Endpoint dailytrends lama sudah 404 (Google memindahkan ke surface "Trending Now",
// per riset Sep 2026). Route yang masih hidup:
// 1. RSS publik: trends.google.com/trending/rss?geo=ID — paling stabil
// 2. Widget API lama: butuh NID cookie warm-up (load homepage dulu) — fallback
//
// Cache in-memory 1 jam: tren harian tidak berubah cepat, hemat rate limit.
export type TrendItem = {
  title: string;
  /** Trafik pencarian relatif Google (mis. "20K+") */
  approxTraffic: string | null;
  /** Artikel berita terkait (judul + url + sumber) */
  articles: { title: string; url: string; source: string }[];
  pictureUrl: string | null;
};

type CacheEntry = { data: TrendItem[]; fetchedAt: number };

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 jam
let cache: CacheEntry | null = null;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Decode entity XML dasar */
function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

/** Ambil inner text elemen pertama: <tag>...</tag> (CDATA-aware) */
function tagText(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  if (!m) return null;
  return decodeXml(m[1]!.replace(/<!\[CDATA\[|\]\]>/g, "").trim());
}

/** Ambil semua elemen <item>...</item> dari RSS */
function rssItems(xml: string): string[] {
  const items: string[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  for (const m of xml.matchAll(re)) {
    if (m[1] !== undefined) items.push(m[1]);
  }
  return items;
}

/** Parse RSS "Trending Now" Google → TrendItem[] */
function parseTrendingRss(xml: string): TrendItem[] {
  return rssItems(xml)
    .map((item) => {
      const title = tagText(item, "title");
      if (!title) return null;
      // ht:approx_traffic (namespace Google) — coba dua bentuk tag
      const approxTraffic = tagText(item, "ht:approx_traffic") ?? tagText(item, "approx_traffic");
      // Berita terkait: ht:news_item* (nested)
      const articles: TrendItem["articles"] = [];
      const newsRe = /<ht:news_item>([\s\S]*?)<\/ht:news_item>/g;
      for (const nm of item.matchAll(newsRe)) {
        if (articles.length >= 3) break;
        const block = nm[1]!;
        const nTitle = tagText(block, "ht:news_item_title") ?? tagText(block, "news_item_title");
        const nUrl = tagText(block, "ht:news_item_url") ?? tagText(block, "news_item_url");
        const nSource = tagText(block, "ht:news_item_source") ?? tagText(block, "news_item_source");
        if (nTitle && nUrl) articles.push({ title: nTitle, url: nUrl, source: nSource ?? "" });
      }
      const pictureUrl = tagText(item, "ht:picture") ?? tagText(item, "picture");
      return { title, approxTraffic, articles, pictureUrl } satisfies TrendItem;
    })
    .filter((t): t is TrendItem => t !== null);
}

/**
 * Ambil tren pencarian Google Indonesia.
 * Strategi: RSS Trending Now (utama) → return kosong bila gagal (UI menampilkan
 * pesan "tren belum tersedia" tanpa error 500). Cache 1 jam.
 */
export async function fetchDailyTrendsID(limit = 20): Promise<TrendItem[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data.slice(0, limit);
  }

  try {
    // Warm-up: load homepage Trends untuk mendapat cookie NID (wajib sejak 2025,
    // tanpa ini endpoint trends merespons 429)
    const cookies: string[] = [];
    try {
      const home = await fetch("https://trends.google.com/trending?geo=ID&hl=id", {
        headers: { "User-Agent": UA, Accept: "text/html" },
        redirect: "follow",
        signal: AbortSignal.timeout(8_000),
      });
      const setCookies =
        home.headers.getSetCookie?.() ??
        (home.headers.get("set-cookie") ? [home.headers.get("set-cookie")!] : []);
      for (const sc of setCookies) {
        const pair = sc.split(";")[0];
        if (pair && !cookies.includes(pair)) cookies.push(pair);
      }
    } catch {
      // Warm-up gagal — coba lanjut tanpa cookie
    }

    const res = await fetch("https://trends.google.com/trending/rss?geo=ID", {
      headers: {
        "User-Agent": UA,
        Accept: "application/rss+xml, application/xml, text/xml, */*",
        "Accept-Language": "id-ID,id;q=0.9",
        ...(cookies.length > 0 ? { Cookie: cookies.join("; ") } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[trends] RSS Trending Now merespons ${res.status}`);
      return cache?.data.slice(0, limit) ?? [];
    }

    const xml = await res.text();
    if (!xml.includes("<item")) {
      console.error("[trends] RSS tidak berisi item tren");
      return cache?.data.slice(0, limit) ?? [];
    }

    const items = parseTrendingRss(xml);
    if (items.length === 0) {
      return cache?.data.slice(0, limit) ?? [];
    }

    cache = { data: items, fetchedAt: Date.now() };
    return items.slice(0, limit);
  } catch (error) {
    console.error("[trends] fetch gagal:", error);
    return cache?.data.slice(0, limit) ?? [];
  }
}

// ---------------------------------------------------------------------------
// Tren musik Indonesia — Apple Music "Most Played" chart (real, tanpa API key)
// ---------------------------------------------------------------------------

export type MusicTrendItem = {
  rank: number;
  title: string;
  artist: string;
  genre: string | null;
  artworkUrl: string | null;
  url: string | null;
};

const MUSIC_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 jam
let musicCache: { data: MusicTrendItem[]; fetchedAt: number } | null = null;

type AppleFeed = {
  feed?: {
    results?: Array<{
      name?: string;
      artistName?: string;
      artworkUrl100?: string;
      url?: string;
      genres?: Array<{ name?: string }>;
    }>;
  };
};

/** Top songs Indonesia dari RSS Apple Music (data chart nyata, bukan karangan). */
export async function fetchTopSongsID(limit = 25): Promise<MusicTrendItem[]> {
  if (musicCache && Date.now() - musicCache.fetchedAt < MUSIC_CACHE_TTL_MS) {
    return musicCache.data.slice(0, limit);
  }
  try {
    const res = await fetch(
      `https://rss.applemarketingtools.com/api/v2/id/music/most-played/${Math.min(limit, 100)}/songs.json`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) {
      console.error(`[trends] Apple Music RSS merespons ${res.status}`);
      return musicCache?.data.slice(0, limit) ?? [];
    }
    const body = (await res.json()) as AppleFeed;
    const items = (body.feed?.results ?? [])
      .map((r, i) => {
        if (!r.name || !r.artistName) return null;
        return {
          rank: i + 1,
          title: r.name,
          artist: r.artistName,
          genre: r.genres?.[0]?.name ?? null,
          artworkUrl: r.artworkUrl100?.replace("100x100bb", "300x300bb") ?? null,
          url: r.url ?? null,
        } satisfies MusicTrendItem;
      })
      .filter((x): x is MusicTrendItem => x !== null);
    if (items.length === 0) return musicCache?.data.slice(0, limit) ?? [];
    musicCache = { data: items, fetchedAt: Date.now() };
    return items.slice(0, limit);
  } catch (error) {
    console.error("[trends] Apple Music fetch gagal:", error);
    return musicCache?.data.slice(0, limit) ?? [];
  }
}

// ---------------------------------------------------------------------------
// Video populer YouTube Indonesia — Data API v3 chart=mostPopular
// ---------------------------------------------------------------------------

export type YoutubeTrendItem = {
  id: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  viewCount: number | null;
  url: string;
};

const YT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 jam
let ytCache: { data: YoutubeTrendItem[]; fetchedAt: number } | null = null;

type YoutubeListResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      channelTitle?: string;
      publishedAt?: string;
      thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
    };
    statistics?: { viewCount?: string };
  }>;
};

/**
 * Video paling populer di YouTube Indonesia (regionCode=ID).
 * Butuh access token OAuth akun YouTube org (scope read/force-ssl).
 */
export async function fetchPopularYouTubeID(
  accessToken: string,
  limit = 12,
): Promise<YoutubeTrendItem[]> {
  const cacheKey = Math.min(limit, 50);
  if (ytCache && Date.now() - ytCache.fetchedAt < YT_CACHE_TTL_MS) {
    return ytCache.data.slice(0, cacheKey);
  }
  try {
    const url = new URL(`${YOUTUBE_API_URL}/videos`);
    url.searchParams.set("part", "snippet,statistics");
    url.searchParams.set("chart", "mostPopular");
    url.searchParams.set("regionCode", "ID");
    url.searchParams.set("maxResults", String(cacheKey));
    url.searchParams.set("access_token", accessToken);

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.error(`[trends] YouTube mostPopular merespons ${res.status}`);
      return ytCache?.data.slice(0, cacheKey) ?? [];
    }
    const body = (await res.json()) as YoutubeListResponse;
    const items = (body.items ?? [])
      .map((v) => {
        if (!v.id || !v.snippet?.title) return null;
        const views = v.statistics?.viewCount ? Number(v.statistics.viewCount) : null;
        return {
          id: v.id,
          title: v.snippet.title,
          channelTitle: v.snippet.channelTitle ?? "",
          thumbnailUrl:
            v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.high?.url ?? null,
          publishedAt: v.snippet.publishedAt ?? null,
          viewCount: Number.isFinite(views) ? views : null,
          url: `https://www.youtube.com/watch?v=${v.id}`,
        } satisfies YoutubeTrendItem;
      })
      .filter((x): x is YoutubeTrendItem => x !== null);
    if (items.length === 0) return ytCache?.data.slice(0, cacheKey) ?? [];
    ytCache = { data: items, fetchedAt: Date.now() };
    return items.slice(0, cacheKey);
  } catch (error) {
    console.error("[trends] YouTube fetch gagal:", error);
    return ytCache?.data.slice(0, cacheKey) ?? [];
  }
}
